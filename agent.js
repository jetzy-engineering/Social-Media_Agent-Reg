// Loads environment variables from the .env file into process.env
import "dotenv/config";

// Imports the Gemini SDK so the agent can talk to Gemini
import { GoogleGenAI } from "@google/genai";

// Imports the MCP client so this agent can connect to the MCP server
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Imports the HTTP client transport so the MCP client can communicate with the MCP server over HTTP
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import express from "express";

const app = express();

app.use(express.json());

// Creates the Gemini AI client using the Gemini API key from .env
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});


// Stores the MCP server URL
// This is where the agent sends MCP requests like listTools() and callTool()
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://localhost:3001/mcp";


// Creates the MCP client instance
// This is the object the agent uses to call MCP server tools
const mcpClient = new Client({
  name: "social-media-posting-agent",
  version: "1.0.0"
});


// Creates the MCP HTTP transport
// This tells the MCP client how to reach the MCP server
const mcpTransport = new StreamableHTTPClientTransport(
  new URL(MCP_SERVER_URL)
);


// Tracks whether the MCP client has already connected
// This prevents reconnecting on every user message
let mcpReady = false;


// Connects the MCP client to the MCP server only once
async function connectMcpServer() {
  if (mcpReady) {
    return;
  }

  await mcpClient.connect(mcpTransport);

  mcpReady = true;
}


// Converts MCP tool definitions into Gemini function declarations
// Gemini needs tools in its own functionDeclaration format
function convertMcpToolsToGeminiFunctionDeclarations(mcpTools) {
  return mcpTools.map((tool) => {
    return {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.inputSchema
    };
  });
}


// Extracts readable text from an MCP tool result
// MCP results can return plain content or structuredContent
function extractTextFromMcpResult(result) {
  if (result.structuredContent) {
    return JSON.stringify(result.structuredContent, null, 2);
  }

  if (!result.content || result.content.length === 0) {
    return "";
  }

  return result.content
    .map((item) => {
      if (item.type === "text") {
        return item.text;
      }

      return JSON.stringify(item);
    })
    .join("\n");
}


// Calls one or more MCP tools that Gemini requested
// Since this is for one account, no userId is added here
async function callMcpTools(functionCalls) {
  const toolResults = [];

  for (const functionCall of functionCalls) {
    const args = {
      ...functionCall.args
    };

    const toolResult = await mcpClient.callTool({
      name: functionCall.name,
      arguments: args
    },
    undefined,
    {
      timeout: 100000
    });

    const toolResultText = extractTextFromMcpResult(toolResult);

    toolResults.push({
      name: functionCall.name,
      response: {
        result: toolResultText
      }
    });
  }

  return toolResults;
}


// Builds the Gemini functionCall parts
// These tell Gemini which tools it requested in the first model response
function buildFunctionCallParts(functionCalls) {
  return functionCalls.map((functionCall) => {
    return {
      functionCall: {
        name: functionCall.name,
        args: {
          ...functionCall.args
        }
      }
    };
  });
}


// Builds the Gemini functionResponse parts
// These send the MCP tool results back into Gemini
function buildFunctionResponseParts(toolResults) {
  return toolResults.map((toolResult) => {
    return {
      functionResponse: {
        name: toolResult.name,
        response: toolResult.response
      }
    };
  });
}


// Builds the user message parts that get sent to Gemini
// If the user included mediaItems, we pass them as text so Gemini can reason about them
function buildUserParts({ message, mediaItems }) {
  const parts = [
    {
      text: message
    }
  ];

  if (mediaItems && mediaItems.length > 0) {
    parts.push({
      text: `User-provided media items:\n${JSON.stringify(mediaItems, null, 2)}`
    });
  }

  return parts;
}


// Main agent function
// This is exported so server.js can call it from the /api/chat route
export async function runAgent({ userMessage, mediaItems = [] }) {
  try {
    await connectMcpServer();

    // Gets the available tools from the MCP server
    const toolsResponse = await mcpClient.listTools();

    // Converts MCP tools into Gemini-compatible tool declarations
    const functionDeclarations = convertMcpToolsToGeminiFunctionDeclarations(
      toolsResponse.tools
    );

    // System instructions that control how the agent behaves
    const systemInstruction = `
You are a helpful AI social media posting assistant.

Your job is to help users create, edit, and publish Facebook Page posts.

Important rules:
- WHENEVER YOU GIVE THE FINAL RESPONSE, ALWAYS SAY WHICH TOOL WAS USED
- Do not publish unless the user clearly asks to publish/post.
- If the user only asks for a draft, write the draft but do not call a posting tool.
- If the user asks to post one image or one video, use facebookPostSingleMedia.
- If the user asks to post multiple images/videos, use facebookPostMultipleMedia.
- If the user provides mediaItems, use those exact media URLs and types.
- If the user wants to post but gives no caption and no media, explain that a post needs at least a caption or media.
- Do not invent image URLs, video URLs, claims, discounts, partnerships, or guarantees.
- Keep captions clear and appropriate for the platform.
- After a tool result comes back, explain the result in simple plain English.
- Do not mention internal tool names unless the user asks how the system works.
- If there is any error, you do not underany circum stance mention the specifics of the error
- Keep it very brief (e.g. There is an issue with the backend)

Media item format:
{
  "type": "image" or "video",
  "url": "https://example.com/media.jpg"
}
`;

    // First Gemini call
    // Gemini decides whether it can answer directly or needs to call an MCP tool
    const firstResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: buildUserParts({
            message: userMessage,
            mediaItems
          })
        }
      ],
      config: {
        systemInstruction,
        tools: [
          {
            functionDeclarations
          }
        ]
      }
    });

    // Gets the function calls Gemini requested
    const functionCalls = firstResponse.functionCalls;

    // If Gemini did not request a tool, return Gemini's normal text answer
    if (!functionCalls || functionCalls.length === 0) {
      return firstResponse.text;
    }

    // Calls the MCP tools that Gemini requested
    const toolResults = await callMcpTools(functionCalls);

    // Builds the functionCall parts to replay Gemini's tool choice back to Gemini
    const functionCallParts = buildFunctionCallParts(functionCalls);

    // Builds the functionResponse parts containing the MCP tool results
    const functionResponseParts = buildFunctionResponseParts(toolResults);

    // Second Gemini call
    // This gives Gemini the tool results so it can explain what happened to the user
    const secondResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: buildUserParts({
            message: userMessage,
            mediaItems
          })
        },
        {
          role: "model",
          parts: functionCallParts
        },
        {
          role: "user",
          parts: functionResponseParts
        }
      ],
      config: {
        systemInstruction,
        tools: [
          {
            functionDeclarations
          }
        ]
      }
    });

    return secondResponse.text;
  }

  catch (error) {
    const error_reply = error.message;
    const errorResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: error_reply
            }
          ]
        }
      ],

      config: {
        systemInstruction,
        tools: [
          {
            functionDeclarations
          }
        ]
      }
    });

    return errorResponse.text;
  }
}

app.post("/agent", async (req, res) => {
  try {
    const response = await runAgent(req.body.message, req.body.media_urls);
    res.json({
      agentResponse: response
    });
  }

  catch(error) {
    res.json({
      errorMessage: error.message
    })
  }
  

})

const port = process.env.PORT;

app.listen(port, '0.0.0.0', () => {
  console.log(
    `Running on Port ${port}`
  );
});
