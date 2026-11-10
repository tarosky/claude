## Review focus

Focus on correctness bugs and risks that linters and type checkers cannot catch:

- Logic errors, wrong conditions, unhandled edge cases (empty input, missing data, concurrency, time zones)
- Security: authorization, trust boundaries, injection, secrets in code or logs
- Data integrity: migrations, destructive operations, partial failure
- Performance problems that grow with data or traffic
- Backward compatibility of public interfaces and stored data

Do NOT comment on code style or formatting.
