import StyleDictionary from "style-dictionary";

const sd = new StyleDictionary({
  source: ["tokens/design-tokens-single-mode.json"],
  platforms: {
    css: {
      transformGroup: "css",
      buildPath: "build/",
      files: [
        {
          destination: "tokens.css",
          format: "css/variables",
        },
      ],
    },
  },
});

await sd.buildAllPlatforms();
console.log("✓ tokens.css written to test-kit/build/");
