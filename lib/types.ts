/** `vote` shows turnout only; `results` reveals the tally. */
export type DisplayMode = "feed" | "vote" | "results";
export type SubmissionStatus = "queued" | "showing" | "done";

export type Session = {
  id: string;
  code: string;
  display_mode: DisplayMode;
  voting_open: boolean;
  display_ms: number;
  created_at: string;
};

export type Submission = {
  id: string;
  session_id: string;
  text: string | null;
  photo_path: string | null;
  status: SubmissionStatus;
  created_at: string;
  started_at: string | null;
};

export type Candidate = {
  id: string;
  session_id: string;
  name: string;
  photo_path: string;
  sort_order: number;
  created_at: string;
};

export type VoteCount = {
  session_id: string;
  candidate_id: string;
  name: string;
  photo_path: string;
  sort_order: number;
  votes: number;
};
