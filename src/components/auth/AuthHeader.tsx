type AuthHeaderProps = {
  title: string;
  description: string;
};

export function AuthHeader({ title, description }: AuthHeaderProps) {
  return (
    <header>
      <p className="text-[10px] uppercase tracking-[0.3em] text-[#8a7a2a]">Private Access</p>
      <h1 className="mt-2 text-2xl font-bold tracking-[0.15em] text-[#ffd700]">{title}</h1>
      <p className="mt-2 text-sm text-[#a08c30]">{description}</p>
    </header>
  );
}
