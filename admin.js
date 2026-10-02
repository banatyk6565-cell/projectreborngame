const ROLE_IDS = {
  owner: '794629074391531521',
  admin: '1040662780233138238',
  communityManager: '1549379668355059783',
  graphic: '1350048629238399037',
};

function getAdminAccess(roles = []) {
  const roleSet = new Set(roles);
  const isOwner = roleSet.has(ROLE_IDS.owner);
  const isAdmin = isOwner || roleSet.has(ROLE_IDS.admin);
  const isCommunityManager = isAdmin || roleSet.has(ROLE_IDS.communityManager);

  return {
    isOwner,
    canManageNews: isCommunityManager,
    canUseChat: isCommunityManager,
    canManageTeam: isOwner,
  };
}

module.exports = { ROLE_IDS, getAdminAccess };
