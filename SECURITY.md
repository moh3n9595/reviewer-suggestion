# Security policy

Security fixes target the latest stable major release. Use the latest patch.

Please report suspected vulnerabilities through GitHub's **Report a vulnerability**
feature in this repository's Security tab. Do not disclose credentials or private
repository content in public issues. Include affected versions, a minimal sanitized
reproduction, and expected impact.

Tokens remain in the caller's process and are sent only to the configured HTTPS
API origin. Custom transports and loggers are trusted caller code. The Action must
not be combined with execution of untrusted PR code in a privileged workflow.
