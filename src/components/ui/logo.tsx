import Image from 'next/image';

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      {/* החלפנו ל-img רגיל והוספנו w-8 h-8 במקום המספרים */}
      <img 
        src="/logo.png"
        alt="StudyBuddy Logo" 
        className="w-8 h-8 object-contain shrink-0"
      />
      <span className="font-heading text-xl font-bold tracking-tight">
        <span className="text-[#AF52DE]">Study</span>
        <span className="text-[#FF8A50]">Buddy</span>
      </span>
    </div>
  );
}