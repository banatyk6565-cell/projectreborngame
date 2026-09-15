const { requireAdmin } = require('./_auth');

module.exports = async function handler(req, res) {
  const result = requireAdmin(req, res, 'canUseChat');
  if (!result) return;

  res.status(200).json({
    user: {
      id: result.session.id,
      name: result.session.globalName,
      avatar: result.session.avatar,
    },
    access: result.access,
  });
};
