import { Socket } from "socket.io";

export class SocketManager {
  private static instance: SocketManager;
  #io!: Socket;

  static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  async initialize(io: Socket) {
    this.#io = io;
  }

  getIO() {
    return this.#io;
  }
}
