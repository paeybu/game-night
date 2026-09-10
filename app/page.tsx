import { createSession } from "./actions";
import SubmitButton from "./submit-button";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-24 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Game Night</h1>
        <p className="max-w-sm text-lg text-zinc-500 dark:text-zinc-400">
          เปิดจอขึ้นมา ให้ทุกคนสแกน QR แล้วส่งรูป ข้อความ และโหวตร่วมกัน
        </p>
      </div>

      <form action={createSession}>
        <SubmitButton>สร้างห้องใหม่</SubmitButton>
      </form>

      <p className="text-sm text-zinc-500">คุณจะได้หน้าจอสำหรับฉายพร้อม QR และหน้าแอดมิน</p>
    </div>
  );
}
