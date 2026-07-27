/// Role identifiers mirroring the API's self-managed RBAC (`user_site_roles.role`).
/// The mobile UI hides what the API would forbid; these groupings drive the
/// role-aware navigation and dashboard tiles.
class Roles {
  Roles._();

  static const sysAdmin = 'SYS_ADMIN';
  static const director = 'DIRECTOR';
  static const financeDirector = 'FINANCE_DIRECTOR';
  static const opsDirector = 'OPS_DIRECTOR';
  static const financeOfficer = 'FINANCE_OFFICER';
  static const siteManager = 'SITE_MANAGER';
  static const siteClerk = 'SITE_CLERK';
  static const opsStaff = 'OPS_STAFF';
  static const auditor = 'AUDITOR';

  /// Every defined role — use to gate a tile that any authenticated user may open.
  static const all = {
    sysAdmin,
    director,
    financeDirector,
    opsDirector,
    financeOfficer,
    siteManager,
    siteClerk,
    opsStaff,
    auditor,
  };

  /// Anyone who can raise requisitions / travel / petty-cash requests from the field.
  static const requestCapture = {
    siteClerk,
    siteManager,
    opsStaff,
    financeOfficer,
    financeDirector,
    opsDirector,
    director,
    sysAdmin,
  };

  /// Roles that approve site-level items (timesheets, petty cash) on the phone.
  static const siteApprovers = {siteManager, financeOfficer};

  /// Roles that approve/authorise money items (requisitions, travel, withdrawals).
  static const financeApprovers = {
    financeDirector,
    opsDirector,
    director,
    sysAdmin,
  };

  /// Directors — raise/co-approve withdrawals; see the command centre.
  static const directors = {director, financeDirector, opsDirector};

  /// Roles that see the command centre + danger feed.
  static const commandCentre = {
    director,
    financeDirector,
    opsDirector,
    sysAdmin,
    auditor,
  };
}
