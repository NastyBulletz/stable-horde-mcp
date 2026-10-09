import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-protocol-version, mcp-session-id');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method === 'GET') return res.status(200).json({ status: 'ok' });

    if (req.method === 'POST') {
        const server = new Server(
            { name: 'pollinations-mcp', version: '1.0.0' },
            { capabilities: { tools: {} } }
        );

        server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [{
                name: 'generate_image',
                description: 'Generate an image using Pollinations.AI from a text prompt.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        prompt: { type: 'string', description: 'The text prompt for image generation.' },
                        seed: { type: 'number', description: 'Optional seed for consistent characters.' },
                    },
                    required: ['prompt'],
                },
            }],
        }));

        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { prompt, seed } = request.params.arguments;
            const finalSeed = seed || Math.floor(Math.random() * 1000000);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${finalSeed}&nologo=true&model=flux`;
            
            return {
                content: [{
                    type: 'text',
                    text: `Image generated! URL: ${imageUrl}\n\nSeed used: ${finalSeed}. Save this seed to keep Maya consistent in future images.`
                }],
            };
        });

        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        await server.connect(transport);
        await transport.handleRequest(req, res);
        return;
    }

    res.status(405).json({ error: 'Method not allowed' });
}
