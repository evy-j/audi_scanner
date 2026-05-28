"use client";

import * as React from "react";

export function ThreatField() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    let animationFrame = 0;
    const points = Array.from({ length: 58 }, (_, index) => ({
      x: (index * 137) % 1000,
      y: (index * 223) % 700,
      phase: index * 0.38,
      speed: 0.18 + (index % 7) * 0.025
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * scale));
      canvas.height = Math.max(1, Math.floor(rect.height * scale));
      context.setTransform(scale, 0, 0, scale, 0, 0);
    };

    const render = (time: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      context.clearRect(0, 0, width, height);

      context.strokeStyle = "rgba(45, 212, 191, 0.09)";
      context.lineWidth = 1;
      for (let x = 0; x < width; x += 42) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      for (let y = 0; y < height; y += 42) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      const normalized = time / 1000;
      const projected = points.map((point) => ({
        x: ((point.x + Math.sin(normalized * point.speed + point.phase) * 32) / 1000) * width,
        y: ((point.y + Math.cos(normalized * point.speed + point.phase) * 26) / 700) * height
      }));

      for (let i = 0; i < projected.length; i += 1) {
        for (let j = i + 1; j < projected.length; j += 1) {
          const left = projected[i];
          const right = projected[j];
          if (!left || !right) continue;
          const distance = Math.hypot(left.x - right.x, left.y - right.y);
          if (distance < 135) {
            context.strokeStyle = `rgba(56, 189, 248, ${0.16 - distance / 900})`;
            context.beginPath();
            context.moveTo(left.x, left.y);
            context.lineTo(right.x, right.y);
            context.stroke();
          }
        }
      }

      projected.forEach((point, index) => {
        context.fillStyle = index % 9 === 0 ? "rgba(248, 113, 113, 0.9)" : "rgba(45, 212, 191, 0.88)";
        context.beginPath();
        context.arc(point.x, point.y, index % 9 === 0 ? 2.7 : 1.8, 0, Math.PI * 2);
        context.fill();
      });

      animationFrame = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener("resize", resize);
    animationFrame = window.requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-80" aria-hidden />;
}
