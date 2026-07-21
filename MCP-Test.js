// Imports the runAgent function from your agent file.
// Change "./agent.js" if your agent file has a different name or location.
import { runAgent } from "./agent.js";

async function testAgent() {
    const result = await runAgent({
      userMessage:
        "Publish this video to instagram with the caption: Enjoying the beauty of nature, one moment at a time.",

      mediaItems: [
        {
          url: "https://samplelib.com/lib/preview/mp4/sample-5s.mp4"
        }
      ]
    });

    console.log("\nAgent response:");
    console.log(result);
}

testAgent();