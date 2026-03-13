function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      error: "Authentication required",
    });
  }
  next();
}

function requireRole(minRole) {
  const hierarchy = { viewer: 1, admin: 2, owner: 3 };

  return (req, res, next) => {
    const userRole = req.session.role;
    if (hierarchy[userRole] < hierarchy[minRole]) {
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions",
      });
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
};
