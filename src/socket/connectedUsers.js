// Shared Socket Presence State
const connectedUsers = new Map();

/**
 * Check if a specific user is currently online via Socket
 * @param {string|Object} userId 
 * @returns {boolean}
 */
const isUserOnline = (userId) => {
  if (!userId) return false;
  return connectedUsers.has(userId.toString());
};

module.exports = {
  connectedUsers,
  isUserOnline
};
