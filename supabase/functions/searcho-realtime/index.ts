import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  
  let openAISocket: WebSocket | null = null;

  socket.onopen = () => {
    console.log("Client connected to Searcho Realtime");
    
    // Connect to OpenAI Realtime API with GPT-4o mini
    openAISocket = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview-2024-12-17",
      ["realtime", `openai-insecure-api-key.${Deno.env.get('OPENAI_API_KEY')}`]
    );

    openAISocket.onopen = () => {
      console.log("Connected to OpenAI Realtime API");
      // Session configuration will be handled by client-side after receiving session.created
    };

    openAISocket.onmessage = (event) => {
      // Forward OpenAI messages to client
      socket.send(event.data);
    };

    openAISocket.onerror = (error) => {
      console.error("OpenAI WebSocket error:", error);
      socket.send(JSON.stringify({
        type: "error",
        message: "Connection to AI failed"
      }));
    };

    openAISocket.onclose = () => {
      console.log("OpenAI connection closed");
      socket.close();
    };
  };

  socket.onmessage = (event) => {
    // Forward client messages to OpenAI
    if (openAISocket && openAISocket.readyState === WebSocket.OPEN) {
      openAISocket.send(event.data);
    }
  };

  socket.onclose = () => {
    console.log("Client disconnected");
    if (openAISocket) {
      openAISocket.close();
    }
  };

  socket.onerror = (error) => {
    console.error("Client WebSocket error:", error);
    if (openAISocket) {
      openAISocket.close();
    }
  };

  return response;
});