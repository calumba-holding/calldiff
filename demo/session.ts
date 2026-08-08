export class PiService {
  static createAgentSession(options: { sessionId?: string }) {
    AuthStorage.create();
    new ModelRegistry();
    createCodingTools();
    if (!options.sessionId) {
      SessionManager.create();
    } else {
      SessionManager.open(options.sessionId);
    }
  }
}

class AuthStorage {
  static create() {}
}

class ModelRegistry {
  constructor() {}
}

class SessionManager {
  static create() {}
  static open(_id: string) {}
}

function createCodingTools() {}
