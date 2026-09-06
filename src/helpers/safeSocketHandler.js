const safeSocketHandler = (handler, socket, io) => {
  return async (data, callback) => {
    try {
      await handler(data, callback, socket, io);
    } catch (error) {
      console.error("Socket handler error:", error);

      callback?.({
        status: 400,
        message: error.message || "Something went wrong",
        data: null,
      });

      socket?.emit("error", {
        status: 400,
        message: error.message,
        data: null,
      });
    }
  };
};

module.exports = safeSocketHandler;
