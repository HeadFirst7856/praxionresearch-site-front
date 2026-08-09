import { useEffect, useRef } from "react";

/**
 * Matrix rain easter egg — fullscreen green katakana/ASCII rain canvas.
 * Rendered as an overlay when the MATRIX command is active.
 */
export function MatrixRain({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const chars =
      "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFZYXWVUTSRQPONMLKJIHGFEDCBA$#@%&*+=<>[]{}";
    const fontSize = 18;
    let drops: number[] = [];
    const initDrops = () => {
      const cols = Math.ceil(canvas.width / fontSize);
      const rows = Math.ceil(canvas.height / fontSize);
      // Scatter columns across the FULL screen height (plus a few above the
      // top) so rain covers the whole screen from frame one. Old code spawned
      // everything above the viewport, so only the top quarter ever had rain
      // until columns staggered in — looked like it "looped back to the top."
      drops = Array.from({ length: cols }, () =>
        Math.floor(Math.random() * (rows + 40)) - 40,
      );
    };
    initDrops();

    const fontCount = chars.length;
    let raf = 0;
    let frame = 0;

    const draw = () => {
      frame += 1;
      // Low alpha => long, slow-fading trails ("longer" rain).
      ctx.fillStyle = "rgba(0, 0, 0, 0.045)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px monospace`;
      // Advance drops every 3rd frame (~20 steps/s) => much slower fall.
      const step = frame % 3 === 0;
      for (let i = 0; i < drops.length; i++) {
        const ch = chars[Math.floor(Math.random() * fontCount)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        ctx.fillStyle = i % 3 === 0 ? "#ffe066" : "#ffd700";
        ctx.fillText(ch, x, y);
        if (step) {
          drops[i] += 1;
          // Recycle only once the drop is clearly past the bottom edge, then
          // re-enter from above with stagger so the screen never empties.
          if (drops[i] * fontSize > canvas.height + fontSize) {
            drops[i] = -Math.floor(Math.random() * 30) - 1;
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    // Capture phase so Esc works even when the terminal input has focus
    // (its React onKeyDown stops propagation to bubble-phase window listeners).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onExit();
      }
    };
    document.addEventListener("keydown", onKey, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onExit]);

  return (
    <div className="fixed inset-0 z-[60] cursor-none bg-black" onClick={onExit}>
      <canvas ref={canvasRef} className="block h-full w-full" />
      <div className="pointer-events-none absolute bottom-4 left-0 right-0 text-center font-mono text-[10px] tracking-[0.3em] text-[#ffd700]/70">
        MATRIX MODE // ESC OR CLICK TO EXIT
      </div>
    </div>
  );
}
