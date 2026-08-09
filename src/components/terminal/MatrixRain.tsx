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
    const fontSize = 16;
    let drops: number[] = [];
    const initDrops = () => {
      const cols = Math.ceil(canvas.width / fontSize);
      drops = Array.from({ length: cols }, () => Math.floor(Math.random() * -50));
    };
    initDrops();

    const fontCount = chars.length;
    let raf = 0;

    const draw = () => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px monospace`;
      for (let i = 0; i < drops.length; i++) {
        const ch = chars[Math.floor(Math.random() * fontCount)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        ctx.fillStyle = i % 3 === 0 ? "#ffe066" : "#ffd700";
        ctx.fillText(ch, x, y);
        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i] += 1;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
    };
  }, [onExit]);

  return (
    <div className="fixed inset-0 z-[60] cursor-none bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" />
      <div className="pointer-events-none absolute bottom-4 left-0 right-0 text-center font-mono text-[10px] tracking-[0.3em] text-[#ffd700]/70">
        MATRIX MODE // PRESS ESC TO EXIT
      </div>
    </div>
  );
}
