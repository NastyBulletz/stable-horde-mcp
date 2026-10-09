import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const transports = {};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method === 'GET') {
        const transport = new SSEServerTransport('/api/mcp', res);
        transports[transport.sessionId] = transport;
        
        res.on('close', () => {
            delete transports[transport.sessionId];
        });

        const server = new Server(
            { name: 'stable-horde-mcp', version: '1.0.0' },
            { capabilities: { tools: {} } }
        );

        server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'generate_image',
                    description: 'Generate an image using Stable Horde from a text prompt.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            prompt: { type: 'string', description: 'The text prompt for image generation.' },
                        },
                        required: ['prompt'],
                    },
                },
            ],
        }));

        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (request.params.name !== 'generate_image') {
                throw new Error('Unknown tool');
            }
            const { prompt } = request.params.arguments;
            const apiKey = process.env.STABLE_HORDE_KEY || '0000000000';
            
            const payload = {
                prompt,
                params: { width: 1024, height: 1024, steps: 30, sampler_name: 'k_euler', n: 1 },
                nsfw: false,
                censor_nsfw: true,
                models: ['stable_diffusion'],
            };

            try {
                const response = await fetch('https://stablehorde.net/api/v2/generate/async', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                    body: JSON.stringify(payload),
                });
                
                if (!response.ok) throw new Error(await response.text());
                
                const job = await response.json();
                const jobId = job.id;
                let imageUrl = null;
                
                for (let i = 0; i < 30; i++) {
                    await new Promise((r) => setTimeout(r, 5000));
                    const statusResponse = await fetch(`https://stablehorde.net/api/v2/generate/status/${jobId}`);
                    const status = await statusResponse.json();
                    
                    if (status.faulted) throw new Error('Image generation faulted.');
                    if (status.done) { 
                        imageUrl = status.generations[0].img; 
                        break; 
                    }
                }
                
                if (!imageUrl) throw new Error('Image generation timed out.');
                
                return {
                    content: [{ type: 'text', text: `Image generated! URL: ${imageUrl}` }],
                };
            } catch (error) {
                return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
            }
        });

        await server.connect(transport);
        return;
    }

    if (req.method === 'POST') {
        const sessionId = req.query.sessionId || req.headers['x-session-id'];
        const transport = transports[sessionId];
        if (!transport) {
            res.status(400).send('No transport found for sessionId');
            return;
        }
        await transport.handlePostMessage(req, res);
        return;
    }

    res.status(405).send('Method not allowed');
}
