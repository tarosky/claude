## Review focus (WordPress plugin)

This is a WordPress plugin. Linters and static analysis (PHPCS/WPCS, PHPStan) already run in CI.

Focus on what automated tools CANNOT catch:

- Architectural fit: does the change follow the plugin's existing patterns?
- Hook timing and priority (e.g. code that runs before the data or user it needs is available, output sent too early)
- Rewrite rule conflicts and permalink issues
- Security logic: capability checks, nonce flow, data trust boundaries (REST permission_callback, AJAX handlers, admin-post)
- Performance: N+1 queries, queries or remote requests on every page load, autoloaded options that grow
- Edge cases in the WordPress lifecycle: activation/deactivation/uninstall, multisite, cron and WP-CLI contexts (no current user, no request)
- Backward compatibility of public hooks, functions, options, and stored data

Do NOT comment on:

- Code style (PHPCS handles it)
- Type errors (PHPStan handles it)
- Basic escaping/sanitization that a linter would flag
