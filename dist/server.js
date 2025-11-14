"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const fs = __importStar(require("node:fs/promises"));
const server = new mcp_js_1.McpServer({
    name: 'My First MCP Server',
    version: '1.0.0',
}, {
    capabilities: {
        resources: {},
        tools: {},
        prompts: {},
    },
});
server.registerTool('create_user', {
    title: 'Create User',
    description: 'Create a new user in the database',
    inputSchema: {
        name: zod_1.z.string(),
        email: zod_1.z.string(),
        address: zod_1.z.string(),
        phone: zod_1.z.string(),
    },
    annotations: {
        // Help AI with HINTs
        title: 'Create a New User',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
    },
}, async (params) => {
    try {
        const id = await createUser(params);
        return {
            content: [{ type: 'text', text: `User ${id} created successfully` }],
        };
    }
    catch (e) {
        return {
            content: [{ type: 'text', text: 'Error creating a user' }],
        };
    }
});
server.registerResource('users', 'users://all', {
    title: 'Users',
    description: 'Get all users data from the database',
    mimeType: 'application/json',
}, async (uri) => {
    const users = await import('./data/users.json', {
        with: { type: 'json' },
    }).then((mod) => mod.default);
    return {
        contents: [
            {
                uri: uri.href,
                text: JSON.stringify(users),
                mimeType: 'application/json',
            },
        ],
    };
});
async function createUser(user) {
    const users = await import('./data/users.json', {
        with: { type: 'json' },
    }).then((mod) => mod.default);
    const id = users.length + 1;
    users.push({ id, ...user });
    await fs.writeFile('./src/data/users.json', JSON.stringify(users, null, 2));
    return id;
}
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
main();
