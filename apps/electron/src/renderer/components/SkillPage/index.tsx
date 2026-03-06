import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import collapsedLogo from "../../assets/imgs/collapsed_logo_clean.svg";
import trashIcon from "../../assets/imgs/Trash.svg";
import uploadIcon from "../../assets/imgs/download_simple_bold.svg";

type SkillIconComponent = (props: { className?: string }) => ReactNode;

type SkillItemData = {
  id: number | string;
  name: string;
  description: string;
  icon: SkillIconComponent;
  enabled: boolean;
};

function IconBase(props: {
  className?: string;
  viewBox?: string;
  children: ReactNode;
  fill?: string;
  stroke?: string;
  strokeWidth?: number | string;
}) {
  return (
    <svg
      viewBox={props.viewBox ?? "0 0 256 256"}
      fill={props.fill ?? "currentColor"}
      stroke={props.stroke}
      strokeWidth={props.strokeWidth}
      className={props.className}
    >
      {props.children}
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z" />
    </IconBase>
  );
}

function ToggleLeftIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M176,56H80a72,72,0,0,0,0,144h96a72,72,0,0,0,0-144Zm0,128H80A56,56,0,0,1,80,72h96a56,56,0,0,1,0,112ZM80,88a40,40,0,1,0,40,40A40,40,0,0,0,80,88Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,80,152Z" />
    </IconBase>
  );
}

function ToggleRightIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M176,56H80a72,72,0,0,0,0,144h96a72,72,0,0,0,0-144Zm0,128H80A56,56,0,0,1,80,72h96a56,56,0,0,1,0,112Zm0-96a40,40,0,1,0,40,40A40,40,0,0,0,176,88Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,176,152Z" />
    </IconBase>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
    </IconBase>
  );
}

function ChatsIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M216,80H184V48a16,16,0,0,0-16-16H40A16,16,0,0,0,24,48V176a8,8,0,0,0,13,6.22L72,154V184a16,16,0,0,0,16,16h93.59L219,230.22a8,8,0,0,0,5,1.78,8,8,0,0,0,8-8V96A16,16,0,0,0,216,80ZM66.55,137.78,40,159.25V48H168v88H71.58A8,8,0,0,0,66.55,137.78ZM216,207.25l-26.55-21.47a8,8,0,0,0-5-1.78H88V152h80a16,16,0,0,0,16-16V96h32Z" />
    </IconBase>
  );
}

function ArrowsCounterClockwiseIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M88,104H40a8,8,0,0,1-8-8V48a8,8,0,0,1,16,0V76.69L62.63,62.06A95.43,95.43,0,0,1,130,33.94h.53a95.36,95.36,0,0,1,67.07,27.33,8,8,0,0,1-11.18,11.44,79.52,79.52,0,0,0-55.89-22.77h-.45A79.56,79.56,0,0,0,73.94,73.37L59.31,88H88a8,8,0,0,1,0,16Zm128,48H168a8,8,0,0,0,0,16h28.69l-14.63,14.63a79.56,79.56,0,0,1-56.13,23.43h-.45a79.52,79.52,0,0,1-55.89-22.77,8,8,0,1,0-11.18,11.44,95.36,95.36,0,0,0,67.07,27.33H126a95.43,95.43,0,0,0,67.36-28.12L208,179.31V208a8,8,0,0,0,16,0V160A8,8,0,0,0,216,152Z" />
    </IconBase>
  );
}

function FileZipIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M184,144H168a8,8,0,0,0-8,8v56a8,8,0,0,0,16,0v-8h8a28,28,0,0,0,0-56Zm0,40h-8V160h8a12,12,0,0,1,0,24Zm-48-32v56a8,8,0,0,1-16,0V152a8,8,0,0,1,16,0ZM96,208a8,8,0,0,1-8,8H56a8,8,0,0,1-7-12l25.16-44H56a8,8,0,0,1,0-16H88a8,8,0,0,1,7,12L69.79,200H88A8,8,0,0,1,96,208ZM213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40v72a8,8,0,0,0,16,0V40h88V88a8,8,0,0,0,8,8h48v16a8,8,0,0,0,16,0V88A8,8,0,0,0,213.66,82.34ZM160,80V51.31L188.69,80Z" />
    </IconBase>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72ZM40,56H92.69l16,16H40ZM216,200H40V88H216Z" />
    </IconBase>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z" />
    </IconBase>
  );
}

function LightningIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M215.79,118.17a8,8,0,0,0-5-5.66L153.18,90.9l14.66-73.33a8,8,0,0,0-13.69-7l-112,120a8,8,0,0,0,3,13l57.63,21.61L88.16,238.43a8,8,0,0,0,13.69,7l112-120A8,8,0,0,0,215.79,118.17ZM109.37,214l10.47-52.38a8,8,0,0,0-5-9.06L62,132.71l84.62-90.66L136.16,94.43a8,8,0,0,0,5,9.06l52.8,19.8Z" />
    </IconBase>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V158.75l-26.07-26.06a16,16,0,0,0-22.63,0l-20,20-44-44a16,16,0,0,0-22.62,0L40,149.37V56ZM40,172l52-52,80,80H40Zm176,28H194.63l-36-36,20-20L216,181.38V200ZM144,100a12,12,0,1,1,12,12A12,12,0,0,1,144,100Z" />
    </IconBase>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M69.12,94.15,28.5,128l40.62,33.85a8,8,0,1,1-10.24,12.29l-48-40a8,8,0,0,1,0-12.29l48-40a8,8,0,0,1,10.24,12.3Zm176,27.7-48-40a8,8,0,1,0-10.24,12.3L227.5,128l-40.62,33.85a8,8,0,1,0,10.24,12.29l48-40a8,8,0,0,0,0-12.29ZM162.73,32.48a8,8,0,0,0-10.25,4.79l-64,176a8,8,0,0,0,4.79,10.26A8.14,8.14,0,0,0,96,224a8,8,0,0,0,7.52-5.27l64-176A8,8,0,0,0,162.73,32.48Z" />
    </IconBase>
  );
}

function GameControllerIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M176,112H152a8,8,0,0,1,0-16h24a8,8,0,0,1,0,16ZM104,96H96V88a8,8,0,0,0-16,0v8H72a8,8,0,0,0,0,16h8v8a8,8,0,0,0,16,0v-8h8a8,8,0,0,0,0-16ZM241.48,200.65a36,36,0,0,1-54.94,4.81c-.12-.12-.24-.24-.35-.37L146.48,160h-37L69.81,205.09l-.35.37A36.08,36.08,0,0,1,44,216,36,36,0,0,1,8.56,173.75a.68.68,0,0,1,0-.14L24.93,89.52A59.88,59.88,0,0,1,83.89,40H172a60.08,60.08,0,0,1,59,49.25c0,.06,0,.12,0,.18l16.37,84.17a.68.68,0,0,1,0,.14A35.74,35.74,0,0,1,241.48,200.65ZM172,144a44,44,0,0,0,0-88H83.89A43.9,43.9,0,0,0,40.68,92.37l0,.13L24.3,176.59A20,20,0,0,0,58,194.3l41.92-47.59a8,8,0,0,1,6-2.71Zm59.7,32.59-8.74-45A60,60,0,0,1,172,160h-4.2L198,194.31a20.09,20.09,0,0,0,17.46,5.39,20,20,0,0,0,16.23-23.11Z" />
    </IconBase>
  );
}

function ChartBarIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M224,200h-8V40a8,8,0,0,0-8-8H152a8,8,0,0,0-8,8V80H96a8,8,0,0,0-8,8v40H48a8,8,0,0,0-8,8v64H32a8,8,0,0,0,0,16H224a8,8,0,0,0,0-16ZM160,48h40V200H160ZM104,96h40V200H104ZM56,144H88v56H56Z" />
    </IconBase>
  );
}

function GithubMarkIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className} viewBox="0 0 24 24">
      <path d="M12 .5C5.65.5.5 5.66.5 12.03c0 5.1 3.29 9.42 7.86 10.94.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.37-3.88-1.37-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.71 1.26 3.37.97.1-.75.4-1.26.72-1.55-2.55-.29-5.24-1.28-5.24-5.71 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.17 1.19a10.97 10.97 0 0 1 5.77 0c2.2-1.5 3.17-1.19 3.17-1.19.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.44-2.7 5.41-5.27 5.7.41.36.78 1.08.78 2.18 0 1.57-.01 2.83-.01 3.21 0 .3.2.66.79.55A11.54 11.54 0 0 0 23.5 12.03C23.5 5.66 18.35.5 12 .5Z" />
    </IconBase>
  );
}

const INITIAL_SKILLS: SkillItemData[] = [
  { id: 1, name: "Analyze provided image", description: "Extract insights from images.", icon: ImageIcon, enabled: true },
  { id: 2, name: "Create Bustly openclaw demo page", description: "Generate Openclaw demo pages.", icon: CodeIcon, enabled: true },
  { id: 3, name: "Add classic Snake game mode", description: "Add Snake game mode.", icon: GameControllerIcon, enabled: false },
  { id: 4, name: "Generate weekly report", description: "Summarize weekly metrics.", icon: ChartBarIcon, enabled: true },
];

function ModalShell(props: {
  isOpen: boolean;
  maxWidth: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!props.isOpen) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={props.onClose} />
      <div className={`relative z-10 w-full ${props.maxWidth} animate-in fade-in zoom-in-95 duration-200`}>
        {props.children}
      </div>
    </div>,
    document.body,
  );
}

function SkillCard(props: {
  skill: SkillItemData;
  onToggle: (id: SkillItemData["id"]) => void;
  onDelete: (id: SkillItemData["id"]) => void;
}) {
  const Icon = props.skill.icon;

  return (
    <div className="group flex h-[88px] items-center justify-between rounded-xl border border-gray-100 bg-white p-4 transition-all hover:shadow-sm">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1A162F]/5 text-[#1A162F]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 pr-4">
          <h3 className="truncate text-sm font-bold text-[#1A162F]">{props.skill.name}</h3>
          <p className="truncate text-xs text-[#6B7280]">{props.skill.description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <button
          type="button"
          onClick={() => props.onToggle(props.skill.id)}
          className={props.skill.enabled ? "text-[#1A162F]" : "text-gray-300"}
          title={props.skill.enabled ? "Disable skill" : "Enable skill"}
        >
          {props.skill.enabled ? <ToggleRightIcon className="h-7 w-7" /> : <ToggleLeftIcon className="h-7 w-7" />}
        </button>
        <button
          type="button"
          onClick={() => props.onDelete(props.skill.id)}
          className="rounded-md p-1 opacity-0 transition-opacity hover:bg-red-50 focus:opacity-100 group-hover:opacity-100"
          title="Delete skill"
        >
          <img src={trashIcon} alt="Delete" className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}

function UploadSkillModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (!props.isOpen) {
    return null;
  }

  return (
    <ModalShell isOpen={props.isOpen} onClose={props.onClose} maxWidth="max-w-lg">
      <div className="rounded-2xl bg-white shadow-2xl">
        <div className="p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-[#1A162F]">Upload skill</h2>
            <button type="button" onClick={props.onClose} className="text-gray-400 transition-colors hover:text-gray-600">
              <XIcon className="h-5 w-5" />
            </button>
          </div>

          <div
            className={`flex h-48 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors ${
              isDragging ? "border-[#1A162F] bg-[#1A162F]/5" : "border-gray-200 hover:border-[#1A162F]/50 hover:bg-gray-50"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) {
                props.onUpload(file);
              }
            }}
            onClick={() => inputRef.current?.click()}
          >
            <div className="mb-4 flex gap-[-8px]">
              <FileZipIcon className="h-8 w-8 translate-x-2 rotate-[-6deg] text-gray-400" />
              <FileIcon className="z-10 h-8 w-8 -translate-y-2 text-gray-400" />
              <FolderIcon className="h-8 w-8 -translate-x-2 rotate-[6deg] text-gray-400" />
            </div>
            <p className="text-sm font-medium text-[#1A162F]">Drag and drop or click to upload</p>
            <input
              ref={inputRef}
              type="file"
              accept=".zip,.skill"
              className="hidden"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const file = event.target.files?.[0];
                if (file) {
                  props.onUpload(file);
                }
              }}
            />
          </div>

          <div className="mt-6 space-y-3">
            <h3 className="text-sm font-bold text-[#1A162F]">File requirements</h3>
            <ul className="space-y-2 text-sm text-[#6B7280]">
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                <span>.zip or .skill file that includes a SKILL.md file at the root level</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                <span>SKILL.md contains a skill name and description formatted in YAML</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function GithubImportModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onImport: (url: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!props.isOpen) {
      setUrl("");
      setError("");
    }
  }, [props.isOpen]);

  return (
    <ModalShell isOpen={props.isOpen} onClose={props.onClose} maxWidth="max-w-md">
      <div className="rounded-2xl bg-white shadow-2xl">
        <div className="relative p-6 text-center">
          <button
            type="button"
            onClick={props.onClose}
            className="absolute top-4 right-4 text-gray-400 transition-colors hover:text-gray-600"
          >
            <XIcon className="h-5 w-5" />
          </button>

          <div className="mb-4 flex items-center justify-center gap-4">
            <GithubMarkIcon className="h-8 w-8 text-[#111827] opacity-90" />
            <div className="text-gray-300">
              <ArrowsCounterClockwiseIcon className="h-6 w-6" />
            </div>
            <img src={collapsedLogo} alt="Bustly" className="h-8 w-8 object-contain" />
          </div>

          <h2 className="mb-2 text-xl font-bold text-[#1A162F]">Import from GitHub</h2>
          <p className="mb-6 text-sm text-[#6B7280]">Import a skill directly from a public GitHub repository.</p>

          <div className="mb-6 text-left">
            <label className="mb-1.5 block text-xs font-bold tracking-wide text-[#1A162F] uppercase">URL</label>
            <input
              type="text"
              value={url}
              autoFocus
              onChange={(event) => {
                setUrl(event.target.value);
                setError("");
              }}
              placeholder="https://github.com/username/repo"
              className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none transition-all focus:border-[#1A162F] focus:ring-2 focus:ring-[#1A162F]/10"
            />
            {error ? <div className="mt-2 text-xs text-red-500">{error}</div> : null}
          </div>

          <button
            type="button"
            disabled={!url}
            onClick={() => {
              const normalized = url.trim();
              const isValid = /^https?:\/\/github\.com\/[^/\s]+\/[^/\s]+(?:\.git)?\/?$/.test(normalized);
              if (!isValid) {
                setError("Please enter a valid GitHub repository URL.");
                return;
              }
              props.onImport(normalized);
            }}
            className="h-10 w-full rounded-lg bg-[#1A162F] text-sm font-bold text-white shadow-sm transition-all hover:bg-[#1A162F]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Import
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export default function SkillPage() {
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [skills, setSkills] = useState(INITIAL_SKILLS);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: SkillItemData["id"] | null }>({
    isOpen: false,
    id: null,
  });

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const handleAddSkill = (skill?: Partial<SkillItemData>) => {
    setSkills((previous) => [
      {
        id: `skill-${Date.now()}`,
        name: skill?.name ?? "New Custom Skill",
        description: skill?.description ?? "A newly created skill for your workspace.",
        enabled: true,
        icon: skill?.icon ?? LightningIcon,
      },
      ...previous,
    ]);
  };

  const skillRows = useMemo(() => skills, [skills]);

  return (
    <div className="custom-scrollbar h-full overflow-y-auto">
      <div className="mx-auto min-h-full max-w-5xl px-6 pt-6 pb-10 font-sans">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="mb-1 text-2xl font-bold text-[#1A162F]">Skills</h1>
            <p className="text-sm text-[#6B7280]">Prepackaged and repeatable best practices &amp; tools for your agents.</p>
          </div>

          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen((previous) => !previous)}
              className="flex items-center gap-2 rounded-lg bg-[#1A162F] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#1A162F]/90"
            >
              <PlusIcon className="h-4 w-4" />
              <span>New skill</span>
            </button>

            {isDropdownOpen ? (
              <div className="absolute top-full right-0 z-20 mt-2 w-72 animate-in fade-in zoom-in-95 rounded-xl border border-gray-100 bg-white p-2 shadow-xl duration-100">
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      void navigate("/chat");
                    }}
                    className="group flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#1A162F]/5"
                  >
                    <ChatsIcon className="mt-0.5 h-[18px] w-[18px] text-[#6B7280] opacity-60 transition-opacity group-hover:opacity-100" />
                    <div>
                      <span className="block text-sm font-semibold text-[#1A162F]">Build with Bustly</span>
                      <span className="mt-0.5 block text-xs text-[#6B7280] transition-colors group-hover:text-[#1A162F]">
                        Build great skills through conversation
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      setShowUploadModal(true);
                    }}
                    className="group flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#1A162F]/5"
                  >
                    <img src={uploadIcon} alt="Upload" className="mt-0.5 h-[18px] w-[18px] opacity-60 transition-opacity group-hover:opacity-100" />
                    <div>
                      <span className="block text-sm font-semibold text-[#1A162F]">Upload a skill</span>
                      <span className="mt-0.5 block text-xs text-[#6B7280] transition-colors group-hover:text-[#1A162F]">
                        Upload .zip, .skill, or folder
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      setShowGithubModal(true);
                    }}
                    className="group flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#1A162F]/5"
                  >
                    <GithubMarkIcon className="mt-0.5 h-[18px] w-[18px] text-[#111827] opacity-60 transition-opacity group-hover:opacity-100" />
                    <div>
                      <span className="block text-sm font-semibold text-[#1A162F]">Import from GitHub</span>
                      <span className="mt-0.5 block text-xs text-[#6B7280] transition-colors group-hover:text-[#1A162F]">
                        Paste a repository link to get started
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {skillRows.length > 0 ? (
            skillRows.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                onToggle={(id) => {
                  setSkills((previous) => previous.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)));
                }}
                onDelete={(id) => {
                  setDeleteModal({ isOpen: true, id });
                }}
              />
            ))
          ) : (
            <div className="col-span-full rounded-xl border border-dashed border-gray-200 bg-gray-50 py-12 text-center text-gray-500">
              No skills installed yet.
            </div>
          )}
        </div>
      </div>

      <UploadSkillModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={(file) => {
          if (!file.name.endsWith(".zip") && !file.name.endsWith(".skill")) {
            return;
          }
          setShowUploadModal(false);
          handleAddSkill({
            name: file.name.replace(/\.(zip|skill)$/i, ""),
            description: "Uploaded from file",
          });
        }}
      />

      <GithubImportModal
        isOpen={showGithubModal}
        onClose={() => setShowGithubModal(false)}
        onImport={(url) => {
          setShowGithubModal(false);
          handleAddSkill({
            name: url.split("/").filter(Boolean).pop() ?? "GitHub Skill",
            description: `Imported from ${url}`,
          });
        }}
      />

      <ModalShell
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: null })}
        maxWidth="max-w-md"
      >
        <div className="rounded-2xl bg-white p-6 shadow-2xl">
          <h2 className="mb-4 text-xl font-bold text-[#1A162F]">Delete Skill</h2>
          <p className="leading-relaxed text-gray-600">Are you sure you want to delete this skill? This action cannot be undone.</p>
          <div className="flex justify-end gap-3 pt-8">
            <button
              type="button"
              onClick={() => setDeleteModal({ isOpen: false, id: null })}
              className="rounded-xl px-4 py-2 text-sm font-bold text-gray-500 transition-colors hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (deleteModal.id == null) {
                  return;
                }
                setSkills((previous) => previous.filter((item) => item.id !== deleteModal.id));
                setDeleteModal({ isOpen: false, id: null });
              }}
              className="rounded-xl bg-red-600 px-6 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
