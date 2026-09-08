from pathlib import Path

RENDER = Path("src/render.mjs")
s = RENDER.read_text(encoding="utf-8")

# In production, never publish the abstract local placeholder. Local fallback is allowed only in dry-run/self-test.
s = s.replace("if (post.force_local_images) {\n        imageBuffer = await localFallbackBuffer(i);\n      } else {",
              "if (cfg.dryRun) {\n        imageBuffer = await localFallbackBuffer(i);\n      } else {")

old = '''        try {
          imageBuffer = await generateImage(primary, fallback, safe);
        } catch (err) {
          console.warn(`[image] AI unavailable for slide ${i + 1}; local fallback: ${err.message}`);
          imageBuffer = await localFallbackBuffer(i);
        }'''
new = '''        try {
          imageBuffer = await generateImage(primary, fallback, safe);
        } catch (err) {
          throw new Error(`[image] Real image generation failed for slide ${i + 1}; refusing placeholder publish: ${err.message}`);
        }'''

if old not in s and new not in s:
    raise SystemExit("Real-image safety patch failed: render catch block not found")
if old in s:
    s = s.replace(old, new, 1)

s = s.replace('const RENDER_VERSION = "kids-editorial-v12-adaptive-long-copy";',
              'const RENDER_VERSION = "kids-editorial-v13-real-image-long-copy";')

RENDER.write_text(s, encoding="utf-8")
print("Production image gate applied: no abstract/local placeholder can be published; image failure stops the run.")
