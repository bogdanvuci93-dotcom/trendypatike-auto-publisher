const headlineLine = {
  type: "object",
  additionalProperties: false,
  required: ["text", "accent"],
  properties: {
    text: { type: "string", maxLength: 26 },
    accent: { type: "boolean" }
  }
};

const fact = {
  type: "object",
  additionalProperties: false,
  required: ["tag", "text"],
  properties: {
    tag: { type: "string", maxLength: 18 },
    text: { type: "string", maxLength: 66 }
  }
};

const source = {
  type: "object",
  additionalProperties: false,
  required: ["title", "publisher", "url"],
  properties: {
    title: { type: "string" },
    publisher: { type: "string" },
    url: { type: "string" }
  }
};

const claim = {
  type: "object",
  additionalProperties: false,
  required: ["claim", "source_urls"],
  properties: {
    claim: { type: "string" },
    source_urls: {
      type: "array",
      minItems: 1,
      items: { type: "string" }
    }
  }
};

export const postSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "topic_title",
    "cover",
    "slide2",
    "slide3",
    "caption",
    "hashtags",
    "image_prompts",
    "sources",
    "claims"
  ],
  properties: {
    topic_title: { type: "string" },
    cover: {
      type: "object",
      additionalProperties: false,
      required: ["headline_lines", "subheadline"],
      properties: {
        headline_lines: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: headlineLine
        },
        subheadline: { type: "string", maxLength: 80 }
      }
    },
    slide2: {
      type: "object",
      additionalProperties: false,
      required: ["headline_lines", "facts"],
      properties: {
        headline_lines: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: headlineLine
        },
        facts: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: fact
        }
      }
    },
    slide3: {
      type: "object",
      additionalProperties: false,
      required: ["headline_lines", "facts", "question"],
      properties: {
        headline_lines: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: headlineLine
        },
        facts: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          items: fact
        },
        question: { type: "string", maxLength: 60 }
      }
    },
    caption: { type: "string", maxLength: 800 },
    hashtags: {
      type: "array",
      minItems: 4,
      maxItems: 8,
      items: { type: "string" }
    },
    image_prompts: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string" }
    },
    sources: {
      type: "array",
      minItems: 2,
      maxItems: 8,
      items: source
    },
    claims: {
      type: "array",
      minItems: 3,
      maxItems: 12,
      items: claim
    }
  }
};

export const verifierSchema = {
  type: "object",
  additionalProperties: false,
  required: ["publish_ok", "reason", "post"],
  properties: {
    publish_ok: { type: "boolean" },
    reason: { type: "string" },
    post: postSchema
  }
};

export const freshSeedSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "topic", "category", "preferred_domains", "visual_subject"],
  properties: {
    id: { type: "string" },
    topic: { type: "string" },
    category: { type: "string" },
    preferred_domains: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: { type: "string" }
    },
    visual_subject: { type: "string" }
  }
};
