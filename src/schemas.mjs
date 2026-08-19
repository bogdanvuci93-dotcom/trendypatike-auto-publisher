const headlineLine = {
  type: "object",
  additionalProperties: false,
  required: ["text", "accent"],
  properties: {
    text: { type: "string", maxLength: 40 },
    accent: { type: "boolean" }
  }
};

const fact = {
  type: "object",
  additionalProperties: false,
  required: ["tag", "text"],
  properties: {
    tag: { type: "string", maxLength: 24 },
    text: { type: "string", minLength: 24, maxLength: 140 }
  }
};

const source = {
  type: "object",
  additionalProperties: false,
  required: ["title", "publisher", "url"],
  properties: {
    title: { type: "string", maxLength: 180 },
    publisher: { type: "string", maxLength: 80 },
    url: { type: "string", maxLength: 500 }
  }
};

const claim = {
  type: "object",
  additionalProperties: false,
  required: ["claim", "source_urls"],
  properties: {
    claim: { type: "string", maxLength: 240 },
    source_urls: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: { type: "string", maxLength: 500 }
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
    topic_title: { type: "string", maxLength: 160 },
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
        subheadline: { type: "string", minLength: 24, maxLength: 140 }
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
        question: { type: "string", maxLength: 80 }
      }
    },
    caption: { type: "string", maxLength: 800 },
    hashtags: {
      type: "array",
      minItems: 4,
      maxItems: 8,
      items: { type: "string", maxLength: 48 }
    },
    image_prompts: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string", maxLength: 500 }
    },
    sources: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: source
    },
    claims: {
      type: "array",
      minItems: 3,
      maxItems: 10,
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
    reason: { type: "string", maxLength: 300 },
    post: postSchema
  }
};

export const freshSeedSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "topic", "category", "preferred_domains", "visual_subject"],
  properties: {
    id: { type: "string", maxLength: 100 },
    topic: { type: "string", maxLength: 180 },
    category: { type: "string", maxLength: 100 },
    preferred_domains: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: { type: "string", maxLength: 120 }
    },
    visual_subject: { type: "string", maxLength: 300 }
  }
};
