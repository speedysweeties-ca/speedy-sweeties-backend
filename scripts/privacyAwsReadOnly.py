"""Sanitized AWS configuration inventory. Read-only CLI operations; no object reads.

Runs in Robert's existing AWS CloudShell session. Credentials, key identifiers,
policy documents and raw CLI output remain in memory and are never printed.
"""
import datetime
import hashlib
import json
import os
import re
import subprocess

ACCOUNT = "080413009273"
BUCKET = "speedy-sweeties-privacy-decisions-080413009273"
USER = "SpeedyPrivacyJournalApplication"
PREFIX = "production/epoch-0001/"
POLICY_HASHES = {
    "application": "629716eaca6dbc68c6ae410e9ee86e1fc22a824d15d25064011023eef8ce2964",
    "operator": "871cefb57d73476112065bcee8f63f19a1120279fe226445ad34cec682f75799",
    "bucket": "74f0fe7c64842cd54e001becd21413c203b20b524e59bad5a1515e753fdb78d0",
}
ALLOWED = {
    "sts": {"get-caller-identity"},
    "s3api": {"get-bucket-location", "get-bucket-versioning", "get-public-access-block", "get-bucket-encryption",
              "get-bucket-ownership-controls", "get-bucket-policy", "get-bucket-policy-status", "get-bucket-lifecycle-configuration",
              "get-object-lock-configuration", "get-bucket-replication"},
    "iam": {"get-user", "get-login-profile", "list-attached-user-policies", "list-user-policies", "list-groups-for-user",
            "get-policy", "get-policy-version", "list-access-keys", "get-access-key-last-used", "get-role", "simulate-principal-policy"},
}


class Unverified(Exception):
    def __init__(self, code="UNVERIFIED"):
        self.code = code if re.fullmatch(r"[A-Za-z0-9_]{1,80}", code) else "UNVERIFIED"


def cli(service, operation, parameters):
    if operation not in ALLOWED.get(service, set()):
        raise Unverified("STOP_NON_READ_OPERATION")
    env = dict(os.environ, AWS_PAGER="", AWS_MAX_ATTEMPTS="1", AWS_IGNORE_CONFIGURED_ENDPOINT_URLS="true")
    # No secret/key IDs in process arguments; JSON parameters are private stdin.
    command = ["aws", service, operation, "--cli-input-json", "file:///dev/stdin", "--output", "json", "--no-cli-pager",
               "--no-cli-auto-prompt", "--region", "ca-central-1", "--cli-connect-timeout", "5", "--cli-read-timeout", "15"]
    try:
        result = subprocess.run(command, input=json.dumps(parameters), text=True, capture_output=True, timeout=25, env=env, check=False)
        if result.returncode:
            match = re.search(r"\(([A-Za-z0-9_]{1,80})\)", result.stderr)
            raise Unverified(match.group(1) if match else "UNVERIFIED_CLI_ERROR")
        return json.loads(result.stdout or "{}")
    except (OSError, ValueError, subprocess.TimeoutExpired):
        raise Unverified("UNVERIFIED_CLI_ACCESS") from None


def normalized(value):
    if isinstance(value, list):
        return sorted((normalized(v) for v in value), key=lambda v: json.dumps(v, sort_keys=True, separators=(",", ":")))
    if isinstance(value, dict):
        return {k: normalized(v) for k, v in sorted(value.items())}
    return value


def policy_hash(value):
    return hashlib.sha256(json.dumps(normalized(value), sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def safe_date(value):
    try:
        return datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00")).isoformat() if value else "NEVER_REPORTED"
    except ValueError:
        return "UNVERIFIED"


def check(run=cli):
    report = {"check": "SPEEDY_AWS_PRIVACY_READONLY", "applicationCredentialsVerified": False,
              "objectsRead": 0, "writes": 0, "organizationControls": "UNVERIFIED"}
    checks = {}

    def observe(name, function):
        try:
            checks[name] = function()
        except Unverified as error:
            checks[name] = "UNVERIFIED_" + error.code
        except Exception:
            checks[name] = "UNVERIFIED_RESPONSE"

    def s3(operation):
        return run("s3api", operation, {"Bucket": BUCKET, "ExpectedBucketOwner": ACCOUNT})

    def absent(operation, code):
        try:
            s3(operation)
            # A present configuration needs explicit review; do not call it absent.
            return False
        except Unverified as error:
            if error.code == code:
                return True
            raise

    try:
        identity = run("sts", "get-caller-identity", {})
        report["accountMatches"] = identity.get("Account") == ACCOUNT
        if not report["accountMatches"]:
            report["result"] = "STOP_ACCOUNT_MISMATCH"
            return report
    except Unverified:
        report["result"] = "STOP_ACCOUNT_UNVERIFIED"
        return report

    observe("regionMatches", lambda: s3("get-bucket-location").get("LocationConstraint") == "ca-central-1")
    observe("versioningEnabled", lambda: s3("get-bucket-versioning").get("Status") == "Enabled")
    def public_blocks():
        blocks = s3("get-public-access-block").get("PublicAccessBlockConfiguration", {})
        return all(blocks.get(k) is True for k in ["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"])
    observe("allPublicBlocksOn", public_blocks)
    observe("bucketNotPublic", lambda: s3("get-bucket-policy-status").get("PolicyStatus", {}).get("IsPublic") is False)
    def encryption():
        rules = s3("get-bucket-encryption").get("ServerSideEncryptionConfiguration", {}).get("Rules", [])
        return bool(rules) and all(r.get("ApplyServerSideEncryptionByDefault", {}).get("SSEAlgorithm") == "AES256" for r in rules)
    observe("sseS3", encryption)
    observe("ownerEnforced", lambda: s3("get-bucket-ownership-controls").get("OwnershipControls", {}).get("Rules") == [{"ObjectOwnership": "BucketOwnerEnforced"}])
    observe("objectLockDisabled", lambda: absent("get-object-lock-configuration", "ObjectLockConfigurationNotFoundError"))
    observe("noLifecycleRules", lambda: absent("get-bucket-lifecycle-configuration", "NoSuchLifecycleConfiguration"))
    observe("noReplication", lambda: absent("get-bucket-replication", "ReplicationConfigurationNotFoundError"))
    observe("bucketPolicyMatchesReviewedUserAndRoles", lambda: policy_hash(json.loads(s3("get-bucket-policy")["Policy"])) == POLICY_HASHES["bucket"])

    user_arn = "arn:aws:iam::" + ACCOUNT + ":user/" + USER
    policy_arn = "arn:aws:iam::" + ACCOUNT + ":policy/SpeedyPrivacyJournalApplicationPolicy"
    observe("applicationIdentityMatches", lambda: run("iam", "get-user", {"UserName": USER}).get("User", {}).get("Arn") == user_arn)
    observe("noUnreviewedPermissionsBoundary", lambda: not run("iam", "get-user", {"UserName": USER}).get("User", {}).get("PermissionsBoundary"))
    observe("onlyApplicationPolicyAttached", lambda: [p.get("PolicyArn") for p in run("iam", "list-attached-user-policies", {"UserName": USER}).get("AttachedPolicies", [])] == [policy_arn])
    observe("noInlinePolicies", lambda: run("iam", "list-user-policies", {"UserName": USER}).get("PolicyNames") == [])
    observe("noGroupGrants", lambda: run("iam", "list-groups-for-user", {"UserName": USER}).get("Groups") == [])

    def no_console():
        try:
            run("iam", "get-login-profile", {"UserName": USER})
            return False
        except Unverified as error:
            if error.code == "NoSuchEntity":
                return True
            raise
    observe("noConsoleLogin", no_console)
    for name, suffix in [("application", "Application"), ("operator", "Operator")]:
        def inspect_policy(name=name, suffix=suffix):
            arn = "arn:aws:iam::" + ACCOUNT + ":policy/SpeedyPrivacyJournal" + suffix + "Policy"
            metadata = run("iam", "get-policy", {"PolicyArn": arn})["Policy"]
            document = run("iam", "get-policy-version", {"PolicyArn": arn, "VersionId": metadata["DefaultVersionId"]})["PolicyVersion"]["Document"]
            if isinstance(document, str):
                import urllib.parse
                document = json.loads(urllib.parse.unquote(document))
            if name == "operator":
                checks["operatorPolicyUnattached"] = metadata.get("AttachmentCount") == 0
            return policy_hash(document) == POLICY_HASHES[name]
        observe(name + "PolicyMatches", inspect_policy)

    def key_metadata():
        keys = run("iam", "list-access-keys", {"UserName": USER})["AccessKeyMetadata"]
        safe = []
        for key in keys:
            last = run("iam", "get-access-key-last-used", {"AccessKeyId": key["AccessKeyId"]}).get("AccessKeyLastUsed", {})
            safe.append({"status": key.get("Status") if key.get("Status") in ["Active", "Inactive"] else "UNVERIFIED",
                         "createdAt": safe_date(key.get("CreateDate")), "lastUsedAt": safe_date(last.get("LastUsedDate")),
                         "serviceReported": bool(last.get("ServiceName") and last.get("ServiceName") != "N/A"),
                         "regionReported": bool(last.get("Region") and last.get("Region") != "N/A")})
        report["credentialMetadata"] = {"count": len(keys), "keys": safe, "matchesSavedRenderCredential": "UNVERIFIED"}
        return len(keys) == 1 and keys[0].get("Status") == "Active"
    observe("oneActiveApplicationKey", key_metadata)
    report["checks"] = checks
    report["result"] = "READBACK_PASS_LIVE_APPLICATION_ACCESS_UNVERIFIED" if all(v is True for v in checks.values()) else "REVIEW_REQUIRED"
    return report


if __name__ == "__main__":
    try:
        print(json.dumps(check(), sort_keys=True))
    except Exception:
        print(json.dumps({"check": "SPEEDY_AWS_PRIVACY_READONLY", "result": "STOP_READ_ERROR", "writes": 0}))
