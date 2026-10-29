"""Prepared operator-only cleanup of the one reserved synthetic test prefix.
No production/retired-history deletion path exists in this command.
"""
import json
import os
import subprocess
import sys

ACCOUNT = "080413009273"
BUCKET = "speedy-sweeties-privacy-decisions-080413009273"
RUN_ID = "recovery-integration-20261028"
PREFIX = "verification/" + RUN_ID + "/"


def cli(service, operation, parameters):
    if (service, operation) not in {("sts", "get-caller-identity"), ("s3api", "list-object-versions"), ("s3api", "delete-object")}:
        raise RuntimeError("STOP_OPERATION_REJECTED")
    if service == "s3api":
        if parameters.get("Bucket") != BUCKET or parameters.get("ExpectedBucketOwner") != ACCOUNT:
            raise RuntimeError("STOP_TARGET_REJECTED")
        if operation == "list-object-versions" and parameters.get("Prefix") != PREFIX:
            raise RuntimeError("STOP_PREFIX_REJECTED")
        if operation == "delete-object" and not parameters.get("Key", "").startswith(PREFIX):
            raise RuntimeError("STOP_PREFIX_REJECTED")
    result = subprocess.run(["aws", service, operation, "--cli-input-json", "file:///dev/stdin", "--output", "json", "--no-cli-pager",
                             "--no-cli-auto-prompt", "--region", "ca-central-1", "--cli-connect-timeout", "5", "--cli-read-timeout", "15"],
                            input=json.dumps(parameters), capture_output=True, text=True, timeout=25,
                            env=dict(os.environ, AWS_MAX_ATTEMPTS="1", AWS_PAGER="", AWS_IGNORE_CONFIGURED_ENDPOINT_URLS="true"), check=False)
    if result.returncode:
        raise RuntimeError("STOP_OPERATOR_ACCESS_OR_REQUEST_FAILURE")
    return json.loads(result.stdout or "{}")


def cleanup(authorization, run=cli):
    if authorization != RUN_ID:
        return {"result": "STOP_CLEANUP_AUTHORIZATION_REQUIRED", "deletedVersions": 0}
    identity = run("sts", "get-caller-identity", {})
    if identity.get("Account") != ACCOUNT or identity.get("Arn") == "arn:aws:iam::" + ACCOUNT + ":user/SpeedyPrivacyJournalApplication":
        return {"result": "STOP_OPERATOR_ACCOUNT_REQUIRED", "deletedVersions": 0}
    parameters = {"Bucket": BUCKET, "ExpectedBucketOwner": ACCOUNT, "Prefix": PREFIX}
    listing = run("s3api", "list-object-versions", parameters)
    versions = listing.get("Versions", []) + listing.get("DeleteMarkers", [])
    if listing.get("IsTruncated") or len(versions) > 500:
        return {"result": "STOP_CLEANUP_INVENTORY_INCOMPLETE", "deletedVersions": 0}
    import re
    pattern = re.compile(re.escape(PREFIX) + r"(?:journal|successor|race)/[0-9]{16}\.json\Z")
    if any(not pattern.fullmatch(v.get("Key", "")) or not isinstance(v.get("VersionId"), str) or not v["VersionId"] for v in versions):
        return {"result": "STOP_UNEXPECTED_SYNTHETIC_INVENTORY", "deletedVersions": 0}
    deleted = 0
    try:
        for version in versions:
            run("s3api", "delete-object", {"Bucket": BUCKET, "ExpectedBucketOwner": ACCOUNT, "Key": version["Key"], "VersionId": version["VersionId"]})
            deleted += 1
        remaining = run("s3api", "list-object-versions", parameters)
        empty = not (remaining.get("Versions") or remaining.get("DeleteMarkers") or remaining.get("IsTruncated"))
        return {"result": "CLEANUP_CONFIRMED" if empty else "STOP_REMAINING_TEST_VERSIONS", "deletedVersions": deleted, "emptyVersionInventory": empty}
    except Exception:
        return {"result": "STOP_PARTIAL_CLEANUP_REVIEW_REQUIRED", "deletedVersions": deleted, "emptyVersionInventory": "UNVERIFIED"}


if __name__ == "__main__":
    try:
        authorization = sys.argv[2] if len(sys.argv) == 3 and sys.argv[1] == "--authorize" else None
        print(json.dumps({"check": "SPEEDY_S3_SYNTHETIC_CLEANUP", **cleanup(authorization)}, sort_keys=True))
    except Exception:
        print(json.dumps({"check": "SPEEDY_S3_SYNTHETIC_CLEANUP", "result": "STOP_ACCESS_OR_TARGET_UNVERIFIED", "emptyVersionInventory": "UNVERIFIED"}))
