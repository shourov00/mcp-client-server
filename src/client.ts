import 'dotenv/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { confirm, input, select } from '@inquirer/prompts';
import { generateText, jsonSchema, ToolSet } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { CreateMessageRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const mcp = new Client(
  {
    name: 'test-client-video',
    version: '1.0.0',
  },
  { capabilities: { sampling: {} } }
);

const transporter = new StdioClientTransport({
  command: 'node',
  args: ['dist/server.js'],
  stderr: 'ignore',
});

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

async function main() {
  await mcp.connect(transporter);
  const [{ tools }, { prompts }, { resources }, { resourceTemplates }] = await Promise.all([
    mcp.listTools(),
    mcp.listPrompts(),
    mcp.listResources(),
    mcp.listResourceTemplates(),
  ]);

  mcp.setRequestHandler(CreateMessageRequestSchema, async (request) => {
    const texts: string[] = [];
    for (const message of request.params.messages) {
      const text = await handleServerMessagePrompt(message);
      if (text != null) texts.push(text);
    }

    return {
      role: 'user',
      model: 'gemini-2.5-flash',
      stopReason: 'endTurn',
      content: {
        type: 'text',
        text: texts.join('\n'),
      },
    };
  });

  console.log('You are connected!');

  while (true) {
    const option = await select({
      message: 'What would you like to do',
      choices: ['Query', 'Tools', 'Resources', 'Prompts'],
    });

    switch (option) {
      case 'Tools':
        const toolName = await select({
          message: 'Select a tool',
          choices: tools.map((tool) => ({
            name: tool?.annotations?.title || tool?.title || tool.name,
            value: tool?.name,
            description: tool?.description,
          })),
        });
        const tool = tools.find((t) => t.name === toolName);
        if (tool === null) {
          console.error('Tool not found');
        } else {
          await handleTool(tool);
        }
        break;
      case 'Resources':
        const resourceUri = await select({
          message: 'Select a resource',
          choices: [
            ...resources.map((resource) => ({
              name: resource?.title || resource?.name,
              value: resource?.uri,
              description: resource?.description,
            })),
            ...resourceTemplates.map((template) => ({
              name: template?.title || template?.name,
              value: template?.uriTemplate,
              description: template?.description,
            })),
          ],
        });
        const uri =
          resources.find((r) => r.uri === resourceUri)?.uri ??
          resourceTemplates.find((r) => r.uriTemplate === resourceUri)?.uriTemplate;
        if (!uri) {
          console.log(uri);
          console.error('Resource not found');
        } else {
          await handleResource(uri);
        }
        break;
      case 'Prompts':
        const promptName = await select({
          message: 'Select a prompt',
          choices: prompts.map((prompt) => ({
            name: prompt?.title || prompt.name,
            value: prompt?.name,
            description: prompt?.description,
          })),
        });
        const prompt = prompts.find((p) => p.name === promptName);
        if (!prompt) {
          console.error('Prompt not found');
        } else {
          await handlePrompt(prompt);
        }
        break;
      case 'Query':
        await handleQuery(tools, resources, resourceTemplates);
    }
  }
}

async function handleTool(tool: any) {
  const args: Record<string, string> = {};
  for (const [key, value] of Object.entries(tool.inputSchema.properties ?? {})) {
    args[key] = await input({
      message: `Enter value for ${key} (${(value as { type: string }).type})`,
    });
  }

  const res = await mcp.callTool({
    name: tool.name,
    arguments: args,
  });

  console.log((res.content as [{ text: string }])[0].text);
}

async function handleResource(uri: string) {
  let finalUri = uri;
  const paramMatches = uri.match(/{([^}]+)}/g);

  if (paramMatches !== null) {
    for (const paramMatch of paramMatches) {
      // replace dynamic param e.g. {userId} with user input
      const paramName = paramMatch.replace('{', '').replace('}', '');
      const paramValue = await input({
        message: `Enter value for ${paramName}`,
      });
      finalUri = finalUri.replace(paramMatch, paramValue);
    }
  }

  const res = await mcp.readResource({
    uri: finalUri,
  });

  console.log(JSON.stringify(JSON.parse((res.contents[0] as any).text), null, 2));
}

async function handlePrompt(prompt: any) {
  const args: Record<string, string> = {};
  for (const arg of prompt.arguments ?? []) {
    args[arg.name] = await input({
      message: `Enter value for ${arg.name}`,
    });
  }

  const res = await mcp.getPrompt({
    name: prompt.name,
    arguments: args,
  });

  for (const message of res.messages) {
    console.log(await handleServerMessagePrompt(message));
  }
}

async function handleServerMessagePrompt(message: any) {
  if (message.content.type !== 'text') return;

  console.log(message.content.text);
  const run = await confirm({
    message: 'Would you like to run the above prompt',
    default: true,
  });

  if (!run) return;

  const { text } = await generateText({
    model: google('gemini-2.5-flash'),
    prompt: message.content.text,
  });
  return text;
}

async function handleQuery(tools: any[], resources: any[], resourceTemplates: any[]) {
  const query = await input({
    message: 'Enter your query',
  });

  const mcpTools: ToolSet = tools.reduce(
      (obj, tool) => ({
        ...obj,
        [tool.name]: {
          description: tool.description,
          inputSchema: jsonSchema(tool.inputSchema),
          execute: async (args: Record<string, any>) =>
            await mcp.callTool({
              name: tool.name,
              arguments: args,
            }),
        },
      }),
      {} as ToolSet
    )


  const allResourceUris = [
    ...resources.map(r => r.uri),
    ...resourceTemplates.map(r => r.uriTemplate),
  ]

  const { text, toolResults } = await generateText({
    model: google('gemini-2.5-flash'),
    prompt: `You can call the "readResource" tool with a "uri" field. Valid URIs include:\n${allResourceUris
      .map((u) => `- ${u}`)
      .join('\n')}\n\nUser question:\n${query}`,
    tools: {
      ...mcpTools,
      readResource: { // Add a read resource tool to the query
        description: 'Read a resource by its URI',
        inputSchema: jsonSchema({
          type: 'object',
          properties: {
            uri: {
              type: 'string',
              description: 'The URI of the MCP resource to read.',
            },
          },
          required: ['uri'],
        }),
        execute: async (args: { uri: string }) => {
          const res = await mcp.readResource({ uri: args.uri });
          const text = (res.contents[0] as any)?.text ?? '';
          return { content: [{ type: 'text', text }] };
        }
      }
    } satisfies ToolSet,
  });

  console.log(text || (toolResults[0]?.output as any)?.content?.[0]?.text || 'No text generated');
}

main();
