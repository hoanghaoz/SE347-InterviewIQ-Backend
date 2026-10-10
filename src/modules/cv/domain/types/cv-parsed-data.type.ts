// Shape of `cvs.parsed_data` (JSONB), filled by the CV parser (Sprint 3).
// Shared contract: interview (Luồng 3, cv_snapshot) and question generation (Luồng 2)
// import this type. Changing it means telling both tracks.
//
// Convention: lists are never null. When the CV has nothing for a list, it is [].
// Single values that may be missing are `null`.

export type CvSkills = {
  languages: string[];
  frameworks: string[];
  databases: string[];
  tools: string[];
};

export type CvExperience = {
  company: string;
  position: string;
  startDate: string | null; // "YYYY-MM", e.g. "2025-06"
  endDate: string | null; // "YYYY-MM"; null = still working there
  description: string | null;
  technologies: string[];
};

export type CvEducation = {
  institution: string;
  degree: string | null;
  graduationYear: number | null;
};

export type CvProject = {
  name: string;
  description: string | null;
  role: string | null;
};

export type CvParsedData = {
  summary: string | null;
  skills: CvSkills;
  experiences: CvExperience[];
  education: CvEducation[];
  projects: CvProject[];
};
