const mongoose = require("mongoose");

class Mongo {
  private host: string;
  private client: typeof mongoose.connection | null = null;

  constructor() {
    this.host = process.env.MONGODB_URI || "";
  }

  getConnection(): typeof mongoose.connection {
    if (this.client) {
      return this.client;
    }

    if (!this.host) {
      throw new Error("MONGODB_URI environment variable is not set");
    }

    // Set debug mode only in development
    mongoose.set("debug", process.env.NODE_ENV === "development");

    // Connect to MongoDB
    mongoose.connect(this.host);

    this.client = mongoose.connection;

    this.client.on("error", (error: Error) => {
      console.error(">>> Database Connection Error:", error);
    });

    return this.client;
  }
}

module.exports = new Mongo();
