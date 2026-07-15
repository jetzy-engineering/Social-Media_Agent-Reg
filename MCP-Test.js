// Imports the runAgent function from your agent file.
// Change "./agent.js" if your agent file has a different name or location.
import { runAgent } from "./agent.js";

async function testAgent() {
  try {
    const result = await runAgent({
      userMessage:
        "Publish these three images to Facebook with the caption: Enjoying the beauty of nature, one moment at a time.",

      mediaItems: [
        {
          type: "image",
          url: "https://img.magnific.com/free-photo/closeup-shot-beautiful-butterfly-with-interesting-textures-orange-petaled-flower_181624-7640.jpg?semt=ais_hybrid&w=740&q=80"
        },
        {
          type: "image",
          url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS4Y0gi55HZHJ_9Tqz9Za1lSjwwoYuNknsLv6snN2eO7w&s=10"
        },
        {
          type: "image",
          url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS7zDMYnGheNT1l7pEW3R5N3Uf4--yCjRprCG9W5WQ58g&s=10"
        }
      ]
    });

    console.log("\nAgent response:");
    console.log(result);
  } catch (error) {
    console.error("\nAgent test failed:");

    if (error instanceof Error) {
      console.error(error.message);
      console.error(error.stack);
    } else {
      console.error(error);
    }

    process.exitCode = 1;
  }
}

testAgent();