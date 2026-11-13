/**
 * GLSL shader sources for the FeatureRenderer.
 */

export const vs2 = `#version 300 es
// Common attributes for a 1x1 quad
in vec2 position;

// Per-instance attributes
in vec4 instance_rect; // start_bp, y_percent, width_bp, height_percent
in vec4 instance_color;

uniform vec2 u_domain; // start_bp, length_bp
uniform vec2 u_resolution; // canvas width, height
uniform vec4 u_layout; // x, y, width, height (of the track in pixels)

out vec4 v_color;

void main() {
    // Calculate the width in pixels for this feature
    float width_bp = instance_rect.z;
    float width_pixels = (width_bp / u_domain.y) * u_layout.z;

    // Ensure minimum width of 1 pixel for visibility
    float min_width_pixels = 1.0;
    float actual_width_bp = width_bp;
    float x_start_bp = instance_rect.x;

    if (width_pixels > 0.0 && width_pixels < min_width_pixels) {
        // Feature is too small, expand it to min_width_pixels while keeping center
        float center_bp = instance_rect.x + width_bp * 0.5;
        float min_width_bp = (min_width_pixels / u_layout.z) * u_domain.y;

        // Adjust start and width to achieve minimum pixel width
        x_start_bp = center_bp - min_width_bp * 0.5;
        actual_width_bp = min_width_bp;
    }

    // Calculate BP coordinates with adjusted width
    float x_bp = x_start_bp + (position.x * actual_width_bp);

    // Map BP to 0..1 in track logic
    float x_normalized = (x_bp - u_domain.x) / u_domain.y;

    // Calculate Y coordinates (0..1 within track)
    // instance_rect.y is top relative to track (0 to 1)
    // instance_rect.w is height relative to track (0 to 1)
    float y_normalized = instance_rect.y + (position.y * instance_rect.w);

    // Now convert to Clip Space (-1 to 1)
    // Track rect in pixels:
    // left: u_layout.x
    // top: u_layout.y (from top? usually Y is down in standard UI, up in WebGL)
    // Let's assume u_layout.y is from TOP of canvas, counting down.

    float screenX = u_layout.x + (x_normalized * u_layout.z);
    float screenY = u_layout.y + (y_normalized * u_layout.w);

    // Convert screen pixel coords to clip space
    // 0 -> -1
    // width -> 1
    float clipX = (screenX / u_resolution.x) * 2.0 - 1.0;
    float clipY = 1.0 - (screenY / u_resolution.y) * 2.0; // Flip Y for proper rendering

    gl_Position = vec4(clipX, clipY, 0, 1);
    v_color = instance_color;
}
`;

export const fs = `#version 300 es
precision mediump float;
in vec4 v_color;
uniform float u_alpha;
out vec4 outColor;

void main() {
    outColor = vec4(v_color.rgb, v_color.a * u_alpha);
}
`;

// ── Textured instanced-quad vertex shader (diamond plot) ──────────────────
export const vsTexture = `#version 300 es
in vec2 position;
in vec4 instance_rect;  // center_bp_offset, center_y_percent, semanticScore, sizeMultiplier
in vec4 instance_color; // tint color (alpha encodes per-instance alpha)

uniform vec2 u_domain;      // start_bp_offset, length_bp
uniform vec2 u_resolution;  // canvas width, height
uniform vec4 u_layout;      // x, y, width, height (track in pixels)
uniform float u_diamondSize; // desired diamond size in pixels
uniform float u_semanticThreshold; // visibility threshold (0 = all visible, 1 = none visible)

out vec4 v_color;
out vec2 v_texCoord;
out float v_fadeAlpha; // per-instance fade for smooth transition

void main() {
    // ── Per-instance semantic zoom filtering ──────────────────────
    // Each diamond has a quasi-random importance score in [0, 1).
    // Diamonds with score < threshold are hidden; those near the
    // threshold smoothly fade in via size scaling and alpha.
    float score = instance_rect.z;
    float fadeRange = 0.04; // 4% of score range for smooth transition
    float fadeFactor = smoothstep(u_semanticThreshold - fadeRange, u_semanticThreshold, score);

    if (fadeFactor <= 0.001) {
        // Below threshold: hide off-screen
        gl_Position = vec4(100.0, 0.0, 0.0, 0.0);
        v_fadeAlpha = 0.0;
        v_color = vec4(0.0);
        v_texCoord = vec2(0.0);
        return;
    }

    // instance_rect.x = center X in bp offset from data region start
    // instance_rect.y = center Y as fraction of track height (0..1)

    // Map the center from bp to pixels.
    // Render diamond at the true feature center (chromStart + 0.5 for 1-bp features)
    // to align with axis ticks which are drawn at base centers.
    float centerBpOffset = instance_rect.x;
    float x_norm = (centerBpOffset - u_domain.x) / u_domain.y;
    float centerScreenX = u_layout.x + x_norm * u_layout.z;
    float centerScreenY = u_layout.y + instance_rect.y * u_layout.w;

    // Per-instance size multiplier from instance_rect.w (0 → default 1.0)
    float sizeMul = instance_rect.w > 0.001 ? instance_rect.w : 1.0;

    // Scale diamond size: cube-root easing for perceptually smooth growth
    float scaledSize = u_diamondSize * sizeMul * pow(fadeFactor, 0.333);

    // position is 0..1 quad, remap to -0.5..+0.5 around center
    float screenX = centerScreenX + (position.x - 0.5) * scaledSize;
    float screenY = centerScreenY + (position.y - 0.5) * scaledSize;

    float clipX = (screenX / u_resolution.x) * 2.0 - 1.0;
    float clipY = 1.0 - (screenY / u_resolution.y) * 2.0;

    gl_Position = vec4(clipX, clipY, 0, 1);
    v_color = instance_color;
    v_texCoord = position; // 0..1 maps to texture UV
    v_fadeAlpha = fadeFactor;
}
`;

export const fsTexture = `#version 300 es
precision mediump float;
in vec4 v_color;
in vec2 v_texCoord;
in float v_fadeAlpha; // per-instance fade from semantic zoom
uniform sampler2D u_texture;
uniform float u_alpha;
out vec4 outColor;

void main() {
    vec4 texel = texture(u_texture, v_texCoord);
    if (texel.a < 0.05) discard; // transparent pixels
    outColor = texel * v_color;
    outColor.a *= v_fadeAlpha * u_alpha;
}
`;

// ── Textured instanced-quad shaders (high-quality rect / bar / heatmap / transcript) ──
// Combines vs2 positioning with texture sampling. The ele_grays texture is
// stretched horizontally across each rect (UV x = 0..1 over width, y = 0..1
// over height). The grayscale texture is multiplied by the instance color to
// produce a "textured" appearance.
export const vsTexturedRect = `#version 300 es
in vec2 position;
in vec4 instance_rect;  // start_bp, y_percent, width_bp, height_percent
in vec4 instance_color;

uniform vec2 u_domain;     // start_bp, length_bp
uniform vec2 u_resolution; // canvas width, height
uniform vec4 u_layout;     // x, y, width, height (track in pixels)

out vec4 v_color;
out vec2 v_texCoord;

void main() {
    float width_bp = instance_rect.z;
    float width_pixels = (width_bp / u_domain.y) * u_layout.z;

    float min_width_pixels = 1.0;
    float actual_width_bp = width_bp;
    float x_start_bp = instance_rect.x;

    if (width_pixels > 0.0 && width_pixels < min_width_pixels) {
        float center_bp = instance_rect.x + width_bp * 0.5;
        float min_width_bp = (min_width_pixels / u_layout.z) * u_domain.y;
        x_start_bp = center_bp - min_width_bp * 0.5;
        actual_width_bp = min_width_bp;
    }

    float x_bp = x_start_bp + (position.x * actual_width_bp);
    float x_normalized = (x_bp - u_domain.x) / u_domain.y;
    float y_normalized = instance_rect.y + (position.y * instance_rect.w);

    float screenX = u_layout.x + (x_normalized * u_layout.z);
    float screenY = u_layout.y + (y_normalized * u_layout.w);

    float clipX = (screenX / u_resolution.x) * 2.0 - 1.0;
    float clipY = 1.0 - (screenY / u_resolution.y) * 2.0;

    gl_Position = vec4(clipX, clipY, 0, 1);
    v_color = instance_color;
    v_texCoord = position; // 0..1 maps texture UV across the rect
}
`;

export const fsTexturedRect = `#version 300 es
precision mediump float;
in vec4 v_color;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_alpha;
out vec4 outColor;

void main() {
    vec4 texel = texture(u_texture, v_texCoord);
    // Multiply grayscale texture by tint color
    outColor = vec4(texel.rgb * v_color.rgb, v_color.a * u_alpha);
}
`;

// ── Line vertex shader (gl.LINE_STRIP) ────────────────────────────────────
// Each vertex is a point on the line: (x_bp_offset, y_normalized, 0, 0).
// No instancing — just plain per-vertex attributes drawn as LINE_STRIP.
export const vsLine = `#version 300 es
in vec2 a_pos;     // (x_bp relative to region.start, y_normalized 0..1)
in vec4 a_color;

uniform vec2 u_domain;     // start_bp_offset, length_bp
uniform vec2 u_resolution; // canvas width, height
uniform vec4 u_layout;     // x, y, width, height (track in pixels)

out vec4 v_color;

void main() {
    float x_normalized = (a_pos.x - u_domain.x) / u_domain.y;
    float screenX = u_layout.x + x_normalized * u_layout.z;
    float screenY = u_layout.y + a_pos.y * u_layout.w;

    float clipX = (screenX / u_resolution.x) * 2.0 - 1.0;
    float clipY = 1.0 - (screenY / u_resolution.y) * 2.0;

    gl_Position = vec4(clipX, clipY, 0, 1);
    v_color = a_color;
}
`;

// ── Canvas-overlay vertex/fragment shaders (single textured quad) ─────────
// Used to blit an offscreen Canvas 2D rendering onto the WebGL canvas.
// The quad covers exactly the track layout area; UV maps 0..1 to the texture.
export const vsOverlay = `#version 300 es
in vec2 position; // 0..1 unit quad
uniform vec2 u_resolution;
uniform vec4 u_layout; // x, y, w, h in device pixels
out vec2 v_texCoord;

void main() {
    float screenX = u_layout.x + position.x * u_layout.z;
    float screenY = u_layout.y + position.y * u_layout.w;
    float clipX = (screenX / u_resolution.x) * 2.0 - 1.0;
    float clipY = 1.0 - (screenY / u_resolution.y) * 2.0;
    gl_Position = vec4(clipX, clipY, 0.0, 1.0);
    v_texCoord = vec2(position.x, position.y);
}
`;

export const fsOverlay = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 outColor;

void main() {
    outColor = texture(u_texture, v_texCoord);
}
`;
