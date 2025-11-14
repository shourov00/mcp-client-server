import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'node:fs/promises';

const server = new McpServer(
  {
    name: 'My First MCP Server',
    version: '1.0.0',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  }
);

server.registerTool(
  'create_user',
  {
    title: 'Create User',
    description: 'Create a new user in the database',
    inputSchema: {
      name: z.string(),
      email: z.string(),
      address: z.string(),
      phone: z.string(),
    },
    annotations: {
      // Help AI with HINTs
      title: 'Create a New User',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (params) => {
    try {
      const id = await createUser(params);
      return {
        content: [{ type: 'text', text: `User ${id} created successfully` }],
      };
    } catch (e) {
      return {
        content: [{ type: 'text', text: 'Error creating a user' }],
      };
    }
  }
);

server.registerResource(
  'users',
  'users://all',
  {
    title: 'Users',
    description: 'Get all users data from the database',
    mimeType: 'application/json',
  },
  async (uri) => {
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
  }
);

server.registerResource(
  'user-details',
  new ResourceTemplate('users://{userId}/profile', { list: undefined }),
  {
    description: "Get a user's details from teh database",
    title: 'User Details',
    mimeType: 'application/json',
  },
  async (uri, { userId }) => {
    const users = await import('./data/users.json', {
      with: { type: 'json' },
    }).then((m) => m.default);
    const user = users.find((u) => u.id === parseInt(userId as string));

    if (user == null) {
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify({ error: 'User not found' }),
            mimeType: 'application/json',
          },
        ],
      };
    }

    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(user),
          mimeType: 'application/json',
        },
      ],
    };
  }
);

async function createUser(user: { name: string; email: string; address: string; phone: string }) {
  const users = await import('./data/users.json', {
    with: { type: 'json' },
  }).then((mod) => mod.default);

  const id = users.length + 1;

  users.push({ id, ...user });

  await fs.writeFile('./src/data/users.json', JSON.stringify(users, null, 2));

  return id;
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
