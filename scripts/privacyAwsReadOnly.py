"""Sanitized AWS configuration inventory. Read-only CLI operations; no object reads.

Runs in Robert's existing AWS CloudShell session. Credentials and raw CLI output
are never printed. Parameter JSON uses private, short-lived local files; key
identifiers never enter arguments or logs. No S3 object contents are read.
"""
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

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
PROVIDER_CODES = {"AccessDenied", "AccessDeniedException", "UnauthorizedOperation", "InvalidClientTokenId",
                  "ExpiredToken", "ExpiredTokenException", "SignatureDoesNotMatch", "InvalidAccessKeyId",
                  "NoSuchEntity", "NoSuchBucket", "NoSuchLifecycleConfiguration",
                  "ObjectLockConfigurationNotFoundError", "ReplicationConfigurationNotFoundError",
                  "Throttling", "ThrottlingException", "RequestLimitExceeded", "ServiceUnavailable", "InternalError"}


class Unverified(Exception):
    def __init__(self, code="UNVERIFIED", category="UNVERIFIED", exit_code=None):
        self.code = code if re.fullmatch(r"[A-Za-z0-9_]{1,80}", code) else "UNVERIFIED"
        self.category = category
        self.exit_code = exit_code

    def diagnostic(self):
        return {"category": self.category, "exitCode": self.exit_code, "code": self.code}


def invoke(command, parameters=None, output="json", direct_environment=False):
    """Capture CLI streams privately; report only fixed categories and allowlisted codes."""
    env = dict(os.environ, AWS_PAGER="", AWS_MAX_ATTEMPTS="1")
    if not direct_environment:
        env["AWS_IGNORE_CONFIGURED_ENDPOINT_URLS"] = "true"
    options = {"text": True, "capture_output": True, "timeout": 25, "env": env, "check": False,
               "stdin": subprocess.DEVNULL}
    directory = None
    path = None
    preparing_input = parameters is not None
    try:
        if parameters is not None:
            # mkdtemp/NamedTemporaryFile create 0700/0600 respectively, independent
            # of a permissive umask; enforce the modes even for restrictive ones.
            # Close the complete UTF-8 JSON before the CLI opens it.
            directory = tempfile.TemporaryDirectory(prefix="speedy-aws-readonly-")
            os.chmod(directory.name, 0o700)
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=directory.name,
                                             prefix="parameters-", suffix=".json", delete=False) as stream:
                path = stream.name
                os.fchmod(stream.fileno(), 0o600)
                json.dump(parameters, stream)
            command = [*command, "--cli-input-json", "file://" + path]
        preparing_input = False
        result = subprocess.run(command, **options)
    except subprocess.TimeoutExpired:
        raise Unverified("CLI_TIMEOUT", "PROCESS_TIMEOUT") from None
    except FileNotFoundError:
        if preparing_input:
            raise Unverified("CLI_PRIVATE_INPUT_FAILED", "PRIVATE_INPUT_PREPARATION_ERROR") from None
        raise Unverified("CLI_NOT_FOUND", "EXECUTABLE_NOT_FOUND") from None
    except OSError:
        if preparing_input:
            raise Unverified("CLI_PRIVATE_INPUT_FAILED", "PRIVATE_INPUT_PREPARATION_ERROR") from None
        raise Unverified("CLI_PROCESS_ERROR", "PROCESS_START_ERROR") from None
    except (ValueError, TypeError):
        raise Unverified("CLI_PRIVATE_INPUT_FAILED", "PRIVATE_INPUT_PREPARATION_ERROR") from None
    finally:
        if directory is not None:
            try:
                try:
                    if path is not None:
                        os.unlink(path)
                finally:
                    directory.cleanup()
            except OSError:
                raise Unverified("CLI_TEMPFILE_CLEANUP_FAILED", "PRIVATE_INPUT_CLEANUP_ERROR") from None
    if result.returncode:
        # Do not print arbitrary parenthesized stderr text: it may contain a key ID.
        found = re.search(r"An error occurred \(([A-Za-z0-9_]{1,80})\)", result.stderr)
        provider_code = found.group(1) if found and found.group(1) in PROVIDER_CODES else None
        lowered = result.stderr.lower()
        category = ({2: "CLI_SYNTAX_OR_INPUT", 252: "CLI_SYNTAX_OR_INPUT", 253: "CLI_ENVIRONMENT_OR_CONFIGURATION",
                     254: "SERVICE_ERROR", 130: "INTERRUPTED"}.get(result.returncode, "CLI_ERROR"))
        if provider_code:
            category = "SERVICE_ERROR"
        elif "unable to load paramfile" in lowered or "invalid json" in lowered:
            category = "CLI_INPUT_JSON_OR_FILE"
        elif any(s in lowered for s in ["connect timeout", "read timeout", "timed out"]):
            category = "NETWORK_TIMEOUT"
        elif any(s in lowered for s in ["could not connect to the endpoint", "ssl validation failed", "proxyconnectionerror"]):
            category = "NETWORK_OR_TLS"
        raise Unverified(provider_code or "CLI_FAILED", category, result.returncode)
    try:
        value = json.loads(result.stdout) if output == "json" else result.stdout.strip()
    except (ValueError, TypeError):
        raise Unverified("CLI_INVALID_JSON", "INVALID_JSON_OUTPUT", 0) from None
    if output == "json" and not isinstance(value, dict):
        raise Unverified("CLI_INVALID_SHAPE", "INVALID_RESPONSE_SHAPE", 0)
    return value


def cli(service, operation, parameters):
    if operation not in ALLOWED.get(service, set()):
        raise Unverified("STOP_NON_READ_OPERATION")
    # invoke() adds only a random local file path, never parameter JSON/key IDs.
    command = ["aws", service, operation]
    command += ["--output", "json", "--no-cli-pager",
               "--no-cli-auto-prompt", "--region", "ca-central-1", "--cli-connect-timeout", "5", "--cli-read-timeout", "15"]
    return invoke(command, parameters if parameters else None)


def identity_comparison():
    """One optional direct identity comparison; never inventory on its behalf."""
    probes = {}
    direct = ["aws", "sts", "get-caller-identity", "--query", "Account", "--output", "text", "--region", "ca-central-1", "--no-cli-pager"]
    for name, command, parameters, output in [("directAccountText", direct, None, "text")]:
        try:
            # Match the owner's direct CLI environment; never use this comparison
            # to authorize inventory if the pinned-endpoint primary check failed.
            value = invoke(command, parameters, output, direct_environment=name == "directAccountText")
            account = value if output == "text" else value.get("Account")
            if not isinstance(account, str) or not re.fullmatch(r"[0-9]{12}", account):
                raise Unverified("CLI_INVALID_IDENTITY", "INVALID_RESPONSE_SHAPE", 0)
            probes[name] = {"category": "SUCCESS", "exitCode": 0, "accountMatches": account == ACCOUNT}
            if account != ACCOUNT:
                break  # Stop even diagnostic calls on a wrong account.
        except Unverified as error:
            probes[name] = error.diagnostic()
    return probes


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


def check(run=cli, diagnose_identity=False):
    report = {"check": "SPEEDY_AWS_PRIVACY_READONLY", "applicationCredentialsVerified": False,
              "objectsRead": 0, "writes": 0, "organizationControls": "UNVERIFIED"}
    checks = {}

    def observe(name, function):
        try:
            checks[name] = function()
        except Unverified as error:
            checks[name] = "UNVERIFIED_" + error.code
            report.setdefault("diagnostics", {})[name] = error.diagnostic()
            if error.category == "PRIVATE_INPUT_CLEANUP_ERROR":
                raise  # Do not continue inventory if private-input removal failed.
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
        if not isinstance(identity.get("Account"), str) or not re.fullmatch(r"[0-9]{12}", identity["Account"]):
            raise Unverified("CLI_INVALID_IDENTITY", "INVALID_RESPONSE_SHAPE", 0)
        report["accountMatches"] = identity.get("Account") == ACCOUNT
        report["identityCheck"] = {"category": "SUCCESS", "exitCode": 0, "accountMatches": report["accountMatches"]}
        if not report["accountMatches"]:
            report["result"] = "STOP_ACCOUNT_MISMATCH"
            return report
    except Unverified as error:
        report["identityCheck"] = error.diagnostic()
        report["result"] = "STOP_ACCOUNT_UNVERIFIED"
    if diagnose_identity:
        report["identityComparison"] = identity_comparison()
        if any(p.get("accountMatches") is False for p in report["identityComparison"].values()):
            report["result"] = "STOP_ACCOUNT_MISMATCH"
        elif report["identityComparison"]["directAccountText"].get("accountMatches") is not True:
            report["result"] = "STOP_ACCOUNT_UNVERIFIED"
    if report.get("result"):
        # Diagnostic success never substitutes for a failed primary target check.
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
        if sys.argv[1:] not in ([], ["--diagnose-identity"]):
            raise ValueError("Unsupported arguments")
        print(json.dumps(check(diagnose_identity=sys.argv[1:] == ["--diagnose-identity"]), sort_keys=True))
    except Unverified as error:
        print(json.dumps({"check": "SPEEDY_AWS_PRIVACY_READONLY", "result": "STOP_PRIVATE_INPUT",
                          "diagnostic": error.diagnostic(), "writes": 0, "objectsRead": 0}))
    except KeyboardInterrupt:
        print(json.dumps({"check": "SPEEDY_AWS_PRIVACY_READONLY", "result": "STOP_INTERRUPTED", "writes": 0, "objectsRead": 0}))
    except Exception:
        print(json.dumps({"check": "SPEEDY_AWS_PRIVACY_READONLY", "result": "STOP_READ_ERROR", "writes": 0}))
