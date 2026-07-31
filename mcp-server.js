// Loads environment variables from the .env file into process.env
import "dotenv/config";

// Imports the MCP server class
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Imports the MCP HTTP server transport
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// Imports Zod for validating tool input schemas
import { z } from "zod";


// Creates the Express app

// Stores the Facebook Graph API version
const FACEBOOK_GRAPH_API_VERSION =
  process.env.FACEBOOK_GRAPH_API_VERSION || "v25.0";


// Stores the Facebook Page ID
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;


// Stores the Facebook Page access token
const FACEBOOK_PAGE_ACCESS_TOKEN =
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN;


// Stores the Instagram Business / Creator account ID
const INSTAGRAM_BUSINESS_ACCOUNT_ID =
  process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;


// Stores the Instagram access token
const INSTAGRAM_ACCESS_TOKEN =
  process.env.INSTAGRAM_ACCESS_TOKEN ||
  FACEBOOK_PAGE_ACCESS_TOKEN;


// Creates a successful MCP text result
function createTextResult(text, structuredContent = null) {
  const result = {
    content: [
      {
        type: "text",
        text
      }
    ]
  };

  if (structuredContent) {
    result.structuredContent = structuredContent;
  }

  return result;
}


// Creates an MCP error result
function createErrorResult(message, structuredContent = null) {
  const result = {
    isError: true,
    content: [
      {
        type: "text",
        text: message
      }
    ]
  };

  if (structuredContent) {
    result.structuredContent = structuredContent;
  }

  return result;
}


// Checks whether a value contains real text
function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}


// Checks whether the Facebook configuration exists
function validateFacebookConfig() {
  if (!FACEBOOK_PAGE_ID || !FACEBOOK_PAGE_ACCESS_TOKEN) {
    return {
      success: false,
      error: "FACEBOOK_CONFIG_MISSING",
      message:
        "Missing FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN environment variable."
    };
  }

  return {
    success: true
  };
}


// Checks whether the Instagram configuration exists
function validateInstagramConfig() {
  if (!INSTAGRAM_BUSINESS_ACCOUNT_ID || !INSTAGRAM_ACCESS_TOKEN) {
    return {
      success: false,
      error: "INSTAGRAM_CONFIG_MISSING",
      message:
        "Missing INSTAGRAM_BUSINESS_ACCOUNT_ID or FACEBOOK_ACCESS_TOKEN environment variable."
    };
  }

  return {
    success: true
  };
}


// Builds a Facebook Graph API URL
function getFacebookUrl(path) {
  return `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}${path}`;
}


// Sends a POST request to the Facebook Graph API
async function callFacebookGraphApi(path, body) {
  const url = getFacebookUrl(path);

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === "object") {
      params.append(key, JSON.stringify(value));
    } else {
      params.append(key, String(value));
    }
  }

  params.append("access_token", FACEBOOK_PAGE_ACCESS_TOKEN);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(JSON.stringify(data, null, 2));
  }

  return data;
}


// Builds an Instagram Graph API URL
function getInstagramUrl(path) {
  return `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}${path}`;
}


// Sends a POST request to the Instagram Graph API
async function callInstagramGraphApi(path, body) {
  const url = getInstagramUrl(path);

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      params.append(key, value.join(","));
    } else if (typeof value === "object") {
      params.append(key, JSON.stringify(value));
    } else {
      params.append(key, String(value));
    }
  }

  params.append("access_token", INSTAGRAM_ACCESS_TOKEN);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(JSON.stringify(data, null, 2));
  }

  return data;
}


// Sends a GET request to the Instagram Graph API
async function getInstagramGraphApi(path, query = {}) {
  const url = new URL(getInstagramUrl(path));

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  }

  url.searchParams.append("access_token", INSTAGRAM_ACCESS_TOKEN);

  const response = await fetch(url);

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(JSON.stringify(data, null, 2));
  }

  return data;
}


// Waits for a specified number of milliseconds
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}


// Waits until Instagram finishes processing a container
async function waitForInstagramContainer(containerId) {
  const maxAttempts = 20;
  const delayMs = 3000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await getInstagramGraphApi(`/${containerId}`, {
      fields: "status_code,status"
    });

    if (status.status_code === "FINISHED") {
      return status;
    }

    if (
      status.status_code === "ERROR" ||
      status.status_code === "EXPIRED"
    ) {
      throw new Error(JSON.stringify(status, null, 2));
    }

    await delay(delayMs);
  }

  throw new Error(
    `Instagram media container ${containerId} did not finish processing in time.`
  );
}


// Creates an Instagram media container
async function createInstagramMediaContainer({
  media,
  caption,
  isCarouselItem
}) {
  const body = {
    is_carousel_item: isCarouselItem ? "true" : undefined
  };

  if (!isCarouselItem && hasText(caption)) {
    body.caption = caption;
  }

  if (media.type === "image") {
    body.media_type = "IMAGE";
    body.image_url = media.url;
  } else if (media.type === "video") {
    body.media_type = isCarouselItem ? "VIDEO" : "REELS";
    body.video_url = media.url;
  } else {
    throw new Error(
      `Unsupported Instagram media type: ${media.type}`
    );
  }

  const container = await callInstagramGraphApi(
    `/${INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`,
    body
  );

  await waitForInstagramContainer(container.id);

  return container;
}


// Publishes a finished Instagram media container
async function publishInstagramContainer(containerId) {
  return callInstagramGraphApi(
    `/${INSTAGRAM_BUSINESS_ACCOUNT_ID}/media_publish`,
    {
      creation_id: containerId
    }
  );
}


// Defines one media item
const mediaItemSchema = z.object({
  type: z
    .enum(["image", "video"])
    .describe("The type of media. Must be either image or video."),

  url: z
    .string()
    .url()
    .describe("A public URL for the image or video to post.")
});


// =====================================================
// Facebook business logic
// =====================================================


// Handles a single Facebook post
async function handleFacebookPostSingleMedia({
  caption,
  media
}) {
  try {
    const configStatus = validateFacebookConfig();

    if (!configStatus.success) {
      return createErrorResult(
        configStatus.message,
        configStatus
      );
    }

    const hasCaption = hasText(caption);
    const hasMedia = Boolean(
      media && hasText(media.url)
    );

    if (!hasCaption && !hasMedia) {
      return createErrorResult(
        "You must provide at least a caption or one image/video to post.",
        {
          success: false,
          error: "EMPTY_POST"
        }
      );
    }

    let facebookResponse;
    let postType;

    if (!hasMedia) {
      postType = "text";

      facebookResponse = await callFacebookGraphApi(
        `/${FACEBOOK_PAGE_ID}/feed`,
        {
          message: caption
        }
      );
    } else if (media.type === "image") {
      postType = "image";

      facebookResponse = await callFacebookGraphApi(
        `/${FACEBOOK_PAGE_ID}/photos`,
        {
          url: media.url,
          caption: caption || ""
        }
      );
    } else if (media.type === "video") {
      postType = "video";

      facebookResponse = await callFacebookGraphApi(
        `/${FACEBOOK_PAGE_ID}/videos`,
        {
          file_url: media.url,
          description: caption || ""
        }
      );
    } else {
      return createErrorResult(
        "Unsupported media type.",
        {
          success: false,
          error: "UNSUPPORTED_MEDIA_TYPE",
          media
        }
      );
    }

    return createTextResult(
      `Facebook ${postType} post published successfully.`,
      {
        success: true,
        platform: "facebook",
        postType,
        caption: caption || "",
        media: media || null,
        facebookResponse
      }
    );
  } catch (error) {
    return createErrorResult(
      "Facebook post failed.",
      {
        success: false,
        error: "FACEBOOK_POST_FAILED",
        details: error.message
      }
    );
  }
}

// Handles one Facebook post containing multiple images
async function handleFacebookPostMultipleMedia({
  caption,
  mediaItems
}) {
  try {
    const configStatus = validateFacebookConfig();

    if (!configStatus.success) {
      return createErrorResult(
        configStatus.message,
        configStatus
      );
    }

    if (
      !Array.isArray(mediaItems) ||
      mediaItems.length < 2
    ) {
      return createErrorResult(
        "Facebook multiple-photo posting requires at least two images.",
        {
          success: false,
          error: "FACEBOOK_MULTIPLE_IMAGES_REQUIRED"
        }
      );
    }

    // This implementation creates one multi-photo Facebook post.
    // Every item must therefore be an image.
    const containsNonImage = mediaItems.some(
      (media) => media.type !== "image"
    );

    if (containsNonImage) {
      return createErrorResult(
        "This Facebook multiple-media tool currently supports images only.",
        {
          success: false,
          error: "FACEBOOK_MULTI_PHOTO_IMAGES_ONLY"
        }
      );
    }

    // Stores the IDs of the unpublished Facebook photos
    const uploadedPhotos = [];

    // Uploads every image without publishing it as a separate post
    for (let i = 0; i < mediaItems.length; i++) {
      const media = mediaItems[i];

      const uploadResponse =
        await callFacebookGraphApi(
          `/${FACEBOOK_PAGE_ID}/photos`,
          {
            url: media.url,

            // Prevents Facebook from immediately creating
            // a separate post for this individual photo
            published: false
          }
        );

      uploadedPhotos.push({
        index: i,
        type: media.type,
        url: media.url,
        photoId: uploadResponse.id,
        uploadResponse
      });
    }

    // Builds the final Facebook feed request
    const feedBody = {
      message: caption || ""
    };

    // Facebook expects:
    // attached_media[0] = {"media_fbid":"PHOTO_ID"}
    // attached_media[1] = {"media_fbid":"PHOTO_ID"}
    // and so on
    for (let i = 0; i < uploadedPhotos.length; i++) {
      feedBody[`attached_media[${i}]`] = {
        media_fbid: uploadedPhotos[i].photoId
      };
    }

    // Creates one Facebook post containing all uploaded photos
    const facebookResponse =
      await callFacebookGraphApi(
        `/${FACEBOOK_PAGE_ID}/feed`,
        feedBody
      );

    return createTextResult(
      `Facebook post with ${mediaItems.length} photos published successfully.`,
      {
        success: true,
        platform: "facebook",
        postType: "multiple_photos",
        caption: caption || "",
        totalMediaItems: mediaItems.length,
        uploadedPhotos,
        facebookResponse
      }
    );
  } catch (error) {
    return createErrorResult(
      "Facebook multiple-photo post failed.",
      {
        success: false,
        error: "FACEBOOK_MULTIPLE_PHOTO_POST_FAILED",
        details: error.message
      }
    );
  }
}


// =====================================================
// Instagram business logic
// =====================================================


// Handles a single Instagram post
async function handleInstagramPostSingleMedia({
  caption,
  media
}) {
  try {
    const configStatus = validateInstagramConfig();

    if (!configStatus.success) {
      return createErrorResult(
        configStatus.message,
        configStatus
      );
    }

    if (!media || !hasText(media.url)) {
      return createErrorResult(
        "Instagram posts must include one image or video URL.",
        {
          success: false,
          error: "INSTAGRAM_MEDIA_REQUIRED"
        }
      );
    }

    const container =
      await createInstagramMediaContainer({
        media,
        caption,
        isCarouselItem: false
      });

    const instagramResponse =
      await publishInstagramContainer(
        container.id
      );

    const postType =
      media.type === "video"
        ? "reel"
        : "image";

    return createTextResult(
      `Instagram ${postType} post published successfully.`,
      {
        success: true,
        platform: "instagram",
        postType,
        caption: caption || "",
        media,
        container,
        instagramResponse
      }
    );
  } catch (error) {
    return createErrorResult(
      "Instagram post failed.",
      {
        success: false,
        error: "INSTAGRAM_POST_FAILED",
        details: error.message
      }
    );
  }
}


// Handles an Instagram carousel post
async function handleInstagramPostMultipleMedia({
  caption,
  mediaItems
}) {
  try {
    const configStatus = validateInstagramConfig();

    if (!configStatus.success) {
      return createErrorResult(
        configStatus.message,
        configStatus
      );
    }

    if (
      !Array.isArray(mediaItems) ||
      mediaItems.length < 2
    ) {
      return createErrorResult(
        "Instagram carousel posting requires at least two media items.",
        {
          success: false,
          error:
            "INSTAGRAM_CAROUSEL_REQUIRES_MULTIPLE_ITEMS"
        }
      );
    }

    const childContainers = [];

    for (
      let i = 0;
      i < mediaItems.length;
      i++
    ) {
      const media = mediaItems[i];

      const childContainer =
        await createInstagramMediaContainer({
          media,
          caption: "",
          isCarouselItem: true
        });

      childContainers.push({
        index: i,
        type: media.type,
        url: media.url,
        containerId: childContainer.id,
        container: childContainer
      });
    }

    const carouselContainer =
      await callInstagramGraphApi(
        `/${INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`,
        {
          media_type: "CAROUSEL",
          children: childContainers.map(
            (item) => item.containerId
          ),
          caption: caption || ""
        }
      );

    await waitForInstagramContainer(
      carouselContainer.id
    );

    const instagramResponse =
      await publishInstagramContainer(
        carouselContainer.id
      );

    return createTextResult(
      `Instagram carousel with ${mediaItems.length} media item(s) published successfully.`,
      {
        success: true,
        platform: "instagram",
        postType: "carousel",
        caption: caption || "",
        totalMediaItems: mediaItems.length,
        childContainers,
        carouselContainer,
        instagramResponse
      }
    );
  } catch (error) {
    return createErrorResult(
      "Instagram carousel post failed.",
      {
        success: false,
        error:
          "INSTAGRAM_CAROUSEL_POST_FAILED",
        details: error.message
      }
    );
  }
}


// =====================================================
// MCP server factory
// =====================================================


function createServerInstance() {
  const server = new McpServer({
    name:
      "facebook-instagram-social-posting-mcp-server",
    version: "1.0.0"
  });


  server.registerTool(
    "facebookPostSingleMedia",
    {
      description:
        "Publish one Facebook Page post with either text, one image, or one video. Use this when the user wants to post a single media item to Facebook.",

      inputSchema: z.object({
        caption: z
          .string()
          .optional()
          .describe(
            "Optional caption/message for the Facebook post."
          ),

        media: mediaItemSchema
          .optional()
          .describe(
            "The single image or video to publish."
          )
      })
    },
    async (args) => {
      return handleFacebookPostSingleMedia(
        args
      );
    }
  );


  server.registerTool(
    "facebookPostMultipleMedia",
    {
      description:
        "Publish ONLY multiple images Facebook in one post. Use this when the user wants to post more than one media item.",

      inputSchema: z.object({
        caption: z
          .string()
          .optional()
          .describe(
            "Optional caption/message to use with the media posts."
          ),

        mediaItems: z
          .array(mediaItemSchema)
          .min(1)
          .describe(
            "A list of image or video media items to publish."
          )
      })
    },
    async (args) => {
      return handleFacebookPostMultipleMedia(
        args
      );
    }
  );


  server.registerTool(
    "instagramPostSingleMedia",
    {
      description:
        "Publish one Instagram post with either one image or one video/Reel. Use this when the user wants to post a single media item to Instagram.",

      inputSchema: z.object({
        caption: z
          .string()
          .optional()
          .describe(
            "Optional caption for the Instagram post."
          ),

        media: mediaItemSchema.describe(
          "The single image or video to publish."
        )
      })
    },
    async (args) => {
      return handleInstagramPostSingleMedia(
        args
      );
    }
  );


  server.registerTool(
    "instagramPostMultipleMedia",
    {
      description:
        "Publish multiple images and/or videos as one Instagram carousel post. Use this when the user wants to post more than one media item to Instagram.",

      inputSchema: z.object({
        caption: z
          .string()
          .optional()
          .describe(
            "Optional caption for the Instagram carousel."
          ),

        mediaItems: z
          .array(mediaItemSchema)
          .min(2)
          .describe(
            "A list of image or video media items to publish as a carousel."
          )
      })
    },
    async (args) => {
      return handleInstagramPostMultipleMedia(
        args
      );
    }
  );


  return server;
}




// Main MCP route
export async function handleRequest(req, res) {
  const mcpServer = createServerInstance();

  const transport =
    new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

  try {
    await mcpServer.connect(transport);

    await transport.handleRequest(
      req,
      res,
      req.body
    );
  } catch (error) {
    console.error(
      "MCP request failed:",
      error
    );

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message:
            "Internal MCP server error"
        },
        id: req.body?.id ?? null
      });
    }
  }
}
