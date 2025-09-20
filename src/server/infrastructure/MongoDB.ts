var mongoose = require("mongoose");

class Mongo {
     constructor() {
          this.host = process.env.MONGODB_URI;
          this.connected = false;
          this.client = null;
     }
     getConnection() {
          if (this.connected) return this.client;
          else {
               mongoose.connect(this.host);
               mongoose.set("debug", true);
               this.client = mongoose.connection;
               this.client.on(
                    "error",
                    console.error.bind(
                         console,
                         ">>> Database Connection Error:",
                    ),
               );
               this.connected = true;
               return this.client;
          }
     }
}
module.exports = new Mongo();
