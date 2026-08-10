import Image from 'next/image';

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <Image 
        src="/logo.png"
        alt="StudyBuddy Logo" 
        width={32} 
        height={32} 
        style={{ width: 'auto', height: 'auto' }}
        className="object-contain"
      />
      <span className="font-heading text-xl font-bold tracking-tight">
        <span className="text-[#635BFF]">Study</span>
        <span className="text-[#FF8A50]">Buddy</span>
      </span>
    </div>
  );
}