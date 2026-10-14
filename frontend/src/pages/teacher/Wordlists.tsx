import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Plus,
  Trash2,
  Sparkles,
  Layers,
  Volume2,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Eye,
  AlertCircle,
  X,
  FileText,
  UploadCloud,
  FileUp,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  listWordlistSets,
  createWordlistSet,
  deleteWordlistSet,
  getWordlistSet,
  previewBulkWords,
  aiExtractCompanion,
  aiParseWordlist,
  listGroups,
  uploadDirectToB2,
} from "@/services/lmsService";
import { api } from "@/services/api";
import * as pdfjsLib from "pdfjs-dist";

if (typeof window !== "undefined" && (pdfjsLib as any)?.GlobalWorkerOptions) {
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${(pdfjsLib as any).version || "3.11.174"}/pdf.worker.min.js`;
}
import {
  Group,
  WordlistSetBrief,
  WordlistSetDetail,
  WordDetailPreview,
} from "@/types";
import { FlashcardDeck } from "@/components/FlashcardDeck";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { EmptyState, LoadingRows, Modal, useConfirm } from "@/components/ui";

export async function extractLinesFromPdf(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;
  const fullLines: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let currentLine = "";

    for (const rawItem of content.items) {
      const item = rawItem as any;
      if (!item.str && item.str !== " ") continue;
      const y = Math.round(item.transform ? item.transform[5] : 0);
      if (lastY !== null && Math.abs(y - lastY) > 5) {
        if (currentLine.trim()) fullLines.push(currentLine.trim());
        currentLine = "";
      }
      currentLine += (currentLine ? " " : "") + item.str;
      lastY = y;
    }
    if (currentLine.trim()) fullLines.push(currentLine.trim());
  }

  return fullLines;
}

export function extractCompanionDirectly(input: string | string[]): WordDetailPreview[] {
  const lines = Array.isArray(input)
    ? input
    : input.split(/\r?\n+/).map((l) => l.trim()).filter((l) => l.length > 0);

  const items: WordDetailPreview[] = [];
  const JUNK = [
    "lead-in",
    "reading",
    "unit",
    "language focus",
    "something to shout about",
    "module",
    "vocabulary",
    "self-assessment",
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("=")) continue;

    // 1. Separate word part and definition part around '='
    const parts = line.split("=");
    let rawWordPart = parts[0];
    let defParts = [parts.slice(1).join("=")];

    // If headword was on the previous line (e.g. line starts with '=')
    if (
      !rawWordPart.trim() ||
      rawWordPart.replace(/^\s*\d+(\.\d+)?\s*/, "").trim().length <= 1
    ) {
      if (i > 0) {
        rawWordPart = lines[i - 1];
      }
    }

    // Look ahead for multiline definitions (until next '=' or 'e.g.' or 'Der.:')
    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j];
      if (nextLine.includes("=")) break;
      if (nextLine.startsWith("e.g.") || nextLine.startsWith("Der.:")) break;
      if (nextLine.includes("/")) {
        const beforeSlash = nextLine.split("/")[0].trim();
        if (beforeSlash) defParts.push(beforeSlash);
        break;
      }
      defParts.push(nextLine);
    }

    // Clean Word: remove leading numbers (1.1, 1.2), phonetics, POS
    let word = rawWordPart.replace(/^\s*\d+(\.\d+)?\s*/, "");
    if (word.includes("/")) {
      word = word.split("/")[0];
    }
    word = word.replace(/\(.*?\)/g, "").trim();
    word = word.replace(/[ª±«°º¿¥§©®¼½¾ßµ`~^]/g, "").trim();
    word = word.replace(/Ô/g, "O").replace(/ô/g, "o");
    word = word.replace(/^.*?["”]\s*/, "").trim();
    word = word.replace(/[’‘`]/g, "'");
    word = word
      .replace(/^[-*•\s]+/, "")
      .replace(/^[^\w\s'"]+/, "")
      .replace(/[/\\=]+$/, "")
      .trim();
    word = word.replace(/\s+/g, " ").trim();

    // Clean Definition: take English definition before any slash / or e.g.
    let def = defParts.join(" ");
    if (def.includes("e.g.")) {
      def = def.split("e.g.")[0];
    }
    if (def.includes("Der.:")) {
      def = def.split("Der.:")[0];
    }
    if (def.includes("/")) {
      def = def.split("/")[0];
    }
    def = def.replace(/^[=\s]+/, "").trim();
    def = def.replace(/[ª±«°º¿¥§©®¼½¾ßµ`~^]/g, "").trim();
    def = def.replace(/Ô/g, "O").replace(/ô/g, "o");
    def = def.replace(/[’‘`]/g, "'");
    def = def.replace(/\s+/g, " ").trim();

    const lower = word.toLowerCase();
    if (
      word &&
      def &&
      word.length > 1 &&
      !/^\d+$/.test(word) &&
      !JUNK.some((k) => lower.includes(k))
    ) {
      const slug = word.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      const audioUrl = `https://ssl.gstatic.com/dictionary/static/sounds/20200429/${slug}--_us_1.mp3`;

      items.push({
        word: word,
        definition: def,
        part_of_speech: "phrase",
        pos: "phrase",
        phonetic: "",
        uzbek_translation: "",
        custom_translation: "",
        example: "",
        example_sentence: "",
        audio_us_url: audioUrl,
        audio_gb_url: null,
        source: "client_companion",
        ai_generated: true,
        fallback_used: false,
      });
    }
  }

  return items;
}

export default function TeacherWordlistsPage() {
  const [sets, setSets] = useState<WordlistSetBrief[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoadingSets, setIsLoadingSets] = useState(true);

  // Bulk import creation form state
  const [title, setTitle] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [rawWordsInput, setRawWordsInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previews, setPreviews] = useState<WordDetailPreview[]>([]);
  const [activeTab, setActiveTab] = useState<"manage" | "create">("manage");

  // Flashcards preview modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [activeSetDetail, setActiveSetDetail] = useState<WordlistSetDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    loadSets();
    listGroups().then(setGroups).catch(() => {});
  }, []);

  const loadSets = async () => {
    setIsLoadingSets(true);
    try {
      const data = await listWordlistSets();
      setSets(data);
    } catch (err: any) {
      console.warn("[WORDLISTS] Failed to load wordlists from server:", err);
      if (err?.response?.status !== 404) {
        toast.error(err?.response?.data?.detail ?? "Failed to load wordlists");
      }
    } finally {
      setIsLoadingSets(false);
    }
  };

  const sanitizeVocabularyInput = (raw: string): string[] => {
    const lines = raw.split(/\r?\n/);
    const validLines: string[] = [];

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // Filter out git logs, commit hashes, code blocks, diffs, terminal outputs
      if (
        /^commit\s+[a-f0-9]{7,40}/i.test(line) ||
        /^Author:\s+/i.test(line) ||
        /^Date:\s+/i.test(line) ||
        /^Merge:\s+/i.test(line) ||
        /^diff\s+--git/i.test(line) ||
        /^index\s+[a-f0-9]+/i.test(line) ||
        /^[+-]{3}\s+/i.test(line) ||
        /^@@\s+-\d+/i.test(line) ||
        line.startsWith("```") ||
        line.startsWith("#") ||
        /^(fatal|error|warning):/i.test(line)
      ) {
        continue;
      }

      // Strip bullet points, leading numbers, markdown list indicators: "1. word - translation" -> "word - translation"
      const cleaned = line.replace(/^(\d+[\.\)]|\*|-|\+)\s+/, "").trim();
      if (!cleaned) continue;

      // Filter code statements or shell commands
      if (
        /^(import|export|const|let|var|function|class|def|curl|git|npm|pnpm|yarn|docker)\b/.test(cleaned) ||
        cleaned.includes("http://") ||
        cleaned.includes("https://")
      ) {
        continue;
      }

      // If comma-separated words on single line without bilingual delimiter, extract words
      if (!cleaned.includes("-") && !cleaned.includes("=") && !cleaned.includes(":") && cleaned.includes(",")) {
        const parts = cleaned.split(",").map((p) => p.trim()).filter(Boolean);
        for (const p of parts) {
          if (/^[a-zA-Z\s'-]+$/.test(p) && p.length < 50) {
            validLines.push(p);
          }
        }
        continue;
      }

      validLines.push(cleaned);
    }

    return validLines;
  };

const JUNK_KEYWORDS = [
  "lead-in",
  "reading",
  "unit",
  "language focus",
  "something to shout about",
  "module",
  "vocabulary",
  "self-assessment",
];

const GARBLED_CHARS_REGEX = /[ª±«°º¿¥§©®¼½¾ßµ`~^]/g;

function sanitizeVocabularyList(items: any[]): WordDetailPreview[] {
  return items
    .map((item) => {
      let rawWord = (item.word || "").trim();
      let rawDef = (item.definition || item.custom_translation || "").trim();

      // Case: If the entire line was packed into word, split by '='
      if (rawWord.includes("=") && !rawDef) {
        const parts = rawWord.split("=");
        rawWord = parts[0].trim();
        rawDef = parts.slice(1).join("=").trim();
      }

      // 1. Headword cleanup
      let word = rawWord;
      if (word.includes("=")) {
        word = word.split("=")[0].trim();
      }
      if (word.includes("/")) {
        word = word.split("/")[0].trim();
      }

      // Normalize font artifacts and quotes
      word = word.replace(/Ô/g, "O").replace(/ô/g, "o");
      word = word.replace(/^.*?["”]\s*/, "");
      word = word.replace(GARBLED_CHARS_REGEX, "");

      // Remove leading numbering like "1.1 ", "1.7 ", "1.60 ", "6 "
      word = word.replace(/^\d+(\.\d+)?\s*/, "");

      // Remove trailing numbering + foreign words (e.g. "1.38 zwiększ", "1.18 lub przygnębi")
      word = word.replace(/\b\d+(\.\d+)?\b.*$/, "").trim();

      // Remove parenthetical POS markers like (n), (v), (adj), (adv), (phr v), (idm)
      word = word
        .replace(
          /\s*\((?:n|v|adj|adv|phr\s*v|phrasal\s*verb|idm|idiom|prep|pron|phrase|c|u)\.?\)\s*$/i,
          ""
        )
        .trim();

      // Normalize quotes and strip punctuation
      word = word.replace(/[’‘`]/g, "'");
      word = word
        .replace(/^[-*•\s]+/, "")
        .replace(/^[^\w\s'"]+/, "")
        .replace(/[/\\=]+$/, "")
        .trim();
      word = word.replace(/\s+/g, " ");

      // 2. Definition cleanup
      let definition = rawDef;
      if (definition.includes("=")) {
        const afterEq = definition.indexOf("=");
        definition = definition.substring(afterEq + 1).trim();
      }

      definition = definition.replace(/^[=\s]+/, "").trim();
      definition = definition.replace(/Ô/g, "O").replace(/ô/g, "o");
      definition = definition.replace(GARBLED_CHARS_REGEX, "");

      // Cut off examples and derivatives
      if (definition.includes("e.g.")) {
        definition = definition.split("e.g.")[0].trim();
      }
      if (definition.includes("Der.:")) {
        definition = definition.split("Der.:")[0].trim();
      }

      // Cut off Polish/foreign translations after slash
      if (/\s+\/\s+/.test(definition)) {
        definition = definition.split(/\s+\/\s+/)[0].trim();
      } else if (definition.includes("/")) {
        const slashIdx = definition.indexOf("/");
        if (slashIdx > 3) {
          definition = definition.substring(0, slashIdx).trim();
        }
      }

      definition = definition.replace(/\s+/g, " ").trim();

      const rawPos = (item.part_of_speech || item.pos || "phrase").toLowerCase().trim();
      const slug = word.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      const audioUrl =
        item.audio_us_url ||
        `https://ssl.gstatic.com/dictionary/static/sounds/20200429/${slug}--_us_1.mp3`;

      return {
        word: word,
        definition: definition,
        part_of_speech: rawPos,
        pos: rawPos,
        phonetic: "",
        uzbek_translation: "",
        custom_translation: "",
        example: "",
        example_sentence: "",
        audio_us_url: audioUrl,
        audio_gb_url: null,
        source: "gemini_ai",
        ai_generated: true,
        fallback_used: false,
      };
    })
    .filter((item) => {
      const lower = item.word.toLowerCase();
      // Drop if word is empty, pure numbers, or shorter than 2 chars
      if (!item.word || /^\d+$/.test(item.word) || item.word.length < 2) return false;
      if (JUNK_KEYWORDS.some((k) => lower.includes(k))) return false;
      return true;
    });
}

  const handleGenerateBulk = async () => {
    const lines = rawWordsInput
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      toast.error("Please enter at least one word or collocation.");
      return;
    }

    const sanitizedWords = Array.from(new Set(lines));

    if (sanitizedWords.length > 50) {
      toast.error("Maximum 50 words per bulk import batch.");
      return;
    }

    setIsGenerating(true);
    try {
      const results = await previewBulkWords(sanitizedWords);
      const sanitized = sanitizeVocabularyList(results);
      setPreviews(sanitized);
      toast.success(`Successfully analyzed ${sanitized.length} words!`);
    } catch (err: any) {
      console.warn("[WORDLISTS PREVIEW] Network preview failed:", err);
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 429 || (detail && /quota|429|resource_exhausted/i.test(detail))) {
        toast.error("AI quota limit reached. Please wait a minute or check your Gemini API key in settings.", {
          duration: 6000,
        });
      } else {
        toast.error(detail ?? "Failed to analyze vocabulary words.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileChange = async (file: File | null) => {
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "txt", "csv"].includes(ext)) {
      toast.error("Unsupported file type. Please upload a PDF, TXT, or CSV file.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 15 MB.");
      return;
    }
    setSelectedFile(file);
    if (!title.trim()) {
      const cleanTitle = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      setTitle(cleanTitle);
    }
    toast.success(`Selected "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`);

    // Direct frontend parsing for PDF
    if (ext === "pdf") {
      setIsAiParsing(true);
      const loadingToast = toast.loading(`Parsing "${file.name}" directly in browser...`);
      try {
        const lines = await extractLinesFromPdf(file);
        const companionItems = extractCompanionDirectly(lines);
        if (companionItems.length > 0) {
          setPreviews(companionItems);
          toast.success(`✨ Extracted ${companionItems.length} vocabulary items directly from PDF!`, {
            id: loadingToast,
          });
          return;
        }
      } catch (err) {
        console.warn("[CLIENT DIRECT PDF PARSE FAILED, MANUAL TRIGGER AVAILABLE]", err);
      } finally {
        setIsAiParsing(false);
        toast.dismiss(loadingToast);
      }
    } else if (ext === "txt") {
      try {
        const text = await file.text();
        const companionItems = extractCompanionDirectly(text);
        if (companionItems.length > 0) {
          setPreviews(companionItems);
          toast.success(`✨ Extracted ${companionItems.length} vocabulary items directly from TXT!`);
          return;
        }
      } catch (err) {
        console.warn("[CLIENT DIRECT TXT PARSE FAILED]", err);
      }
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAiParse = async () => {
    if (!selectedFile && !rawWordsInput.trim()) {
      toast.error("Please upload a document (.pdf, .txt, .csv) or enter vocabulary text.");
      return;
    }

    setIsAiParsing(true);
    try {
      // 1. Direct Client-side PDF Extraction (zero backend dependency)
      if (selectedFile && selectedFile.name.toLowerCase().endsWith(".pdf")) {
        const lines = await extractLinesFromPdf(selectedFile);
        const companionItems = extractCompanionDirectly(lines);
        if (companionItems.length > 0) {
          setPreviews(companionItems);
          toast.success(`✨ Extracted ${companionItems.length} clean vocabulary items directly from PDF!`);
          return;
        }
      }

      // 2. Direct Client-side TXT Extraction
      if (selectedFile && selectedFile.name.toLowerCase().endsWith(".txt")) {
        const text = await selectedFile.text();
        const companionItems = extractCompanionDirectly(text);
        if (companionItems.length > 0) {
          setPreviews(companionItems);
          toast.success(`✨ Extracted ${companionItems.length} clean vocabulary items directly from TXT!`);
          return;
        }
      }

      // 3. Direct Client-side textarea Extraction (if contains '=')
      if (rawWordsInput.trim() && rawWordsInput.includes("=")) {
        const companionItems = extractCompanionDirectly(rawWordsInput);
        if (companionItems.length > 0) {
          setPreviews(companionItems);
          toast.success(`✨ Extracted ${companionItems.length} clean vocabulary items directly from text!`);
          return;
        }
      }

      // 4. Fallback to API if not companion structure
      const results = await aiExtractCompanion({
        text: rawWordsInput.trim() || undefined,
        file: selectedFile || undefined,
        fileName: selectedFile?.name,
      });

      if (!results || results.length === 0) {
        toast.error("No vocabulary items could be extracted. Please check document contents.");
        return;
      }

      const sanitizedResults = sanitizeVocabularyList(results);
      if (sanitizedResults.length === 0) {
        toast.error("No valid vocabulary entries identified after sanitization.");
        return;
      }

      setPreviews(sanitizedResults);
      toast.success(`✨ Successfully extracted ${sanitizedResults.length} clean vocabulary items!`);
    } catch (err: any) {
      console.error("[AI PARSE ERROR]", err);
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 429 || (detail && /quota|429|resource_exhausted/i.test(detail))) {
        toast.error("AI quota limit reached. Please wait a minute or check your Gemini API key.", {
          duration: 6000,
        });
      } else {
        toast.error(detail ?? "Failed to extract vocabulary with AI.");
      }
    } finally {
      setIsAiParsing(false);
    }
  };

  const handleAddBlankRow = () => {
    setPreviews((prev) => [
      ...prev,
      {
        word: "",
        part_of_speech: "noun",
        pos: "noun",
        phonetic: "",
        uzbek_translation: "",
        custom_translation: "",
        definition: "",
        example: "",
        example_sentence: "",
        audio_us_url: null,
        audio_gb_url: null,
      },
    ]);
  };

  const handleUpdatePreview = (
    index: number,
    field: keyof WordDetailPreview,
    val: string
  ) => {
    setPreviews((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      if (field === "uzbek_translation") {
        copy[index].custom_translation = val;
      } else if (field === "custom_translation") {
        copy[index].uzbek_translation = val;
      } else if (field === "example_sentence") {
        copy[index].example = val;
      } else if (field === "example") {
        copy[index].example_sentence = val;
      }
      return copy;
    });
  };

  const handleRemovePreview = (index: number) => {
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const normalizePos = (pos?: string | null): string => {
    if (!pos) return "noun";
    const p = pos.toLowerCase().trim().replace("-", "_");
    if (p === "adj" || p === "adjective") return "adjective";
    if (p === "v" || p === "verb") return "verb";
    if (p === "n" || p === "noun") return "noun";
    if (p === "adv" || p === "adverb") return "adverb";
    if (p === "idiom" || p === "phrase") return "idiom";
    if (p === "phrasal_verb" || p === "phrasal verb") return "phrasal_verb";
    return "noun";
  };

  const handlePlayPreviewAudio = (item: WordDetailPreview) => {
    if (!item.word?.trim()) return;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(item.word);
      utterance.lang = "en-US";
      window.speechSynthesis.speak(utterance);
    } else {
      const audioUrl = item.audio_us_url || item.audio_gb_url;
      if (audioUrl) {
        new Audio(audioUrl).play().catch(() => {});
      }
    }
  };

  const handleSaveSet = async () => {
    if (!title.trim()) {
      toast.error("Please enter a title for this vocabulary set.");
      return;
    }
    if (previews.length === 0) {
      toast.error("Please generate or add vocabulary items before saving.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        title: title.trim(),
        group_id: selectedGroupId || null,
        items: previews.map((item, idx) => {
          const uzTrans = (item.uzbek_translation || item.custom_translation || "").trim();
          const engDef = (item.definition || "").trim();

          return {
            word: item.word.trim(),
            part_of_speech: item.part_of_speech ? normalizePos(item.part_of_speech) : "noun",
            phonetic: item.phonetic?.trim() || null,
            definition: engDef || null,
            uzbek_translation: uzTrans || null,
            example: (item.example_sentence || item.example)?.trim() || null,
            audio_us_url: item.audio_us_url?.trim() || null,
            audio_gb_url: item.audio_gb_url?.trim() || null,
            order_index: idx,
          };
        }),
      };

      // Direct-to-B2 Upload Optimization: upload JSON directly to B2 to bypass backend memory
      let storageUrl: string | null = null;
      try {
        const jsonBlob = new Blob([JSON.stringify(payload.items, null, 2)], {
          type: "application/json",
        });
        const safeTitle = title.trim().toLowerCase().replace(/[^a-z0-9]/g, "_") || "wordlist";
        storageUrl = await uploadDirectToB2(
          jsonBlob,
          `${safeTitle}_${Date.now()}.json`,
          "application/json"
        );
      } catch (b2Err) {
        console.warn("[B2 DIRECT] Direct B2 wordlist upload bypassed; sending payload to server:", b2Err);
        storageUrl = null;
      }

      const savePayload = {
        ...payload,
        storage_url: storageUrl,
        total_words: payload.items.length,
      };

      await createWordlistSet(savePayload);

      toast.success("Vocabulary set created successfully!");
      // Reset form
      setTitle("");
      setRawWordsInput("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setPreviews([]);
      setActiveTab("manage");
      loadSets();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to save vocabulary set.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (setId: string, setTitle: string) => {
    confirm(
      `Are you sure you want to permanently delete "${setTitle}" and all its flashcards?`,
      async () => {
        try {
          await deleteWordlistSet(setId);
          toast.success("Wordlist deleted.");
          setSets((prev) => prev.filter((s) => s.id !== setId));
        } catch (err: any) {
          toast.error(err?.response?.data?.detail ?? "Failed to delete wordlist.");
        }
      }
    );
  };

  const handleOpenDeck = async (setId: string) => {
    setIsLoadingDetail(true);
    setPreviewModalOpen(true);
    try {
      const data = await getWordlistSet(setId);
      setActiveSetDetail(data);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to load flashcard deck.");
      setPreviewModalOpen(false);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  return (
    <ErrorBoundary>
      <ConfirmDialog />
      <div className="space-y-6 overflow-x-hidden">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2.5">
              <span>Vocabulary & Wordlists</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                Flashcards Engine
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              Bulk-generate definitions, pronunciations, and interactive flashcard decks for your students.
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 w-full sm:w-auto select-none">
            <button
              type="button"
              onClick={() => setActiveTab("manage")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all touch-manipulation ${
                activeTab === "manage"
                  ? "bg-white dark:bg-[#111827] text-brand-600 dark:text-brand-400 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Manage Sets ({sets.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("create")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all touch-manipulation ${
                activeTab === "create"
                  ? "bg-white dark:bg-[#111827] text-brand-600 dark:text-brand-400 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Bulk Create</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: MANAGE WORDLIST SETS */}
        {/* ========================================================================= */}
        {activeTab === "manage" && (
          <div className="space-y-4">
            {isLoadingSets ? (
              <div className="card p-6">
                <LoadingRows rows={5} />
              </div>
            ) : sets.length === 0 ? (
              <EmptyState
                title="No wordlist sets created yet"
                description="Import your first batch of vocabulary words with automated dictionary definitions and interactive flashcards."
                action={
                  <button
                    type="button"
                    onClick={() => setActiveTab("create")}
                    className="btn-primary"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create First Wordlist</span>
                  </button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sets.map((s) => (
                  <div
                    key={s.id}
                    className="card hover:shadow-md hover:border-brand-300 dark:hover:border-brand-700 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="p-2 rounded-xl bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 shrink-0">
                            <BookOpen className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-zinc-900 dark:text-white text-sm truncate" title={s.title}>
                              {s.title}
                            </h3>
                            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                              {s.group_name || "All Cohorts (Global)"}
                            </span>
                          </div>
                        </div>

                        <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 shrink-0">
                          {s.word_count} words
                        </span>
                      </div>

                      <p className="text-[11px] text-zinc-400 mt-3">
                        Created: {new Date(s.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800">
                      <button
                        type="button"
                        onClick={() => handleOpenDeck(s.id)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/40 dark:hover:bg-brand-900/60 text-brand-700 dark:text-brand-300 border border-brand-200/60 dark:border-brand-800/60 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Practice Deck</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(s.id, s.title)}
                        className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/40 transition"
                        title="Delete Wordlist"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: BULK IMPORT & GENERATE */}
        {/* ========================================================================= */}
        {activeTab === "create" && (
          <div className="space-y-6">
            {/* Input Form Card */}
            <div className="card space-y-4">
              <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-bold text-sm border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Bulk Wordlist Generator</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Wordlist Title *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Unit 4 - Environment & Science"
                    className="input"
                  />
                </div>

                <div>
                  <label className="label">Target Cohort (Optional)</label>
                  <select
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    className="input"
                  >
                    <option value="">All Cohorts (Global Access)</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.english_level})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Document Dropzone (PDF, TXT, CSV) */}
              <div>
                <label className="label flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-zinc-200">
                    <UploadCloud className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    <span>Upload Document (PDF, TXT, CSV)</span>
                  </span>
                  <span className="text-[11px] font-normal text-zinc-400">
                    Supports tables, collocations, and scans up to 15 MB
                  </span>
                </label>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf,.txt,.csv"
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                  className="hidden"
                />

                {!selectedFile ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      handleFileChange(e.dataTransfer.files?.[0] || null);
                    }}
                    className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
                      isDragging
                        ? "border-brand-500 bg-brand-50/50 dark:bg-brand-950/20 scale-[0.99]"
                        : "border-zinc-200 dark:border-zinc-800 hover:border-brand-400 dark:hover:border-brand-600 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30"
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="p-3 rounded-full bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400">
                        <UploadCloud className="w-6 h-6" />
                      </div>
                      <div className="text-xs">
                        <span className="font-semibold text-brand-600 dark:text-brand-400 hover:underline">
                          Click to upload
                        </span>{" "}
                        <span className="text-zinc-500 dark:text-zinc-400">or drag and drop document</span>
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        PDF (Cambridge/IELTS lists, tables), TXT, or CSV
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3.5 rounded-2xl border border-brand-200 dark:border-brand-800/60 bg-brand-50/30 dark:bg-brand-950/20">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-brand-100 dark:bg-brand-900/50 text-brand-600 dark:text-brand-400 shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                          {selectedFile.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                          <span>{(selectedFile.size / 1024).toFixed(1)} KB</span>
                          <span>•</span>
                          <span className="uppercase font-semibold tracking-wider text-[10px] px-1.5 py-0.2 rounded bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300">
                            {selectedFile.name.split(".").pop() || "DOC"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="label flex items-center justify-between">
                  <span>Vocabulary Text / Collocations (Optional if document uploaded)</span>
                  <span className="text-[11px] text-zinc-400 font-normal">One per line or comma-separated</span>
                </label>
                <textarea
                  rows={5}
                  value={rawWordsInput}
                  onChange={(e) => setRawWordsInput(e.target.value)}
                  placeholder={`eager for - intiq bo'lmoq\nbloom - gullamoq\nlook forward to = intizorlik bilan kutmoq\nbreak the ice\nsustainable development\nambiguous`}
                  className="input font-mono text-xs"
                />
                <p className="text-[11px] text-zinc-400 mt-1">
                  Supports plain words, collocations, phrasal verbs, idioms, and bilingual notes (<code>e.g. eager for - intiq bo'lmoq</code>).
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                <p className="text-xs text-zinc-400">
                  Gemini extracts words, parts of speech, English definitions, and Uzbek translations automatically.
                </p>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleAddBlankRow}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Row</span>
                  </button>

                  {/* Standard Dictionary Resolve */}
                  {rawWordsInput.trim() && !selectedFile && (
                    <button
                      type="button"
                      onClick={handleGenerateBulk}
                      disabled={isGenerating || isAiParsing}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand-200 dark:border-brand-800 hover:bg-brand-50 dark:hover:bg-brand-950/40 text-xs font-semibold text-brand-700 dark:text-brand-300 transition disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Resolving...</span>
                        </>
                      ) : (
                        <>
                          <span>⚡ Quick Dict</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Dedicated Gemini AI Parser */}
                  <button
                    type="button"
                    onClick={handleAiParse}
                    disabled={isAiParsing || (!selectedFile && !rawWordsInput.trim())}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-brand-600 hover:from-purple-500 hover:to-brand-500 text-white text-xs font-semibold shadow-sm transition active:scale-95 disabled:opacity-50"
                  >
                    {isAiParsing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>✨ AI Parsing with Gemini...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span>✨ AI Parse with Gemini</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Editable Preview Table */}
            {previews.length > 0 && (
              <div className="card space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                      Generated Vocabulary Preview ({previews.length} words)
                    </h3>
                    <p className="text-xs text-zinc-400">
                      You can modify definitions, parts of speech, or examples before saving.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddBlankRow}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Row</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveSet}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition active:scale-95 disabled:opacity-50"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>💾 Save & Publish Wordlist</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-thin">
                  <table className="w-full text-left text-xs border-collapse min-w-[960px]">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50">
                        <th className="py-2.5 px-3 font-semibold w-10 text-center">#</th>
                        <th className="py-2.5 px-3 font-semibold w-48">Word / Phrase</th>
                        <th className="py-2.5 px-3 font-semibold w-28">POS</th>
                        <th className="py-2.5 px-3 font-semibold w-56">Uzbek Translation</th>
                        <th className="py-2.5 px-3 font-semibold w-64">English Definition</th>
                        <th className="py-2.5 px-3 font-semibold">Example Sentence</th>
                        <th className="py-2.5 px-3 font-semibold w-20 text-center">Audio</th>
                        <th className="py-2.5 px-3 font-semibold w-12 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {previews.map((item, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                          {/* # */}
                          <td className="py-2.5 px-3 text-center text-zinc-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>

                          {/* 1. Word / Phrase */}
                          <td className="py-2.5 px-3 font-bold text-zinc-900 dark:text-white align-top">
                            <input
                              type="text"
                              value={item.word}
                              onChange={(e) => handleUpdatePreview(idx, "word", e.target.value)}
                              placeholder="e.g. eager for, endless"
                              className="w-full bg-zinc-50 dark:bg-zinc-800/60 rounded px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-700 text-xs font-bold focus:border-brand-500 outline-none"
                            />
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              {item.phonetic && (
                                <span className="text-[10px] text-zinc-400 font-mono">
                                  {item.phonetic}
                                </span>
                              )}
                              {(item.source === "gemini_ai" || item.ai_generated) && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.2 rounded bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 font-semibold">
                                  ✨ AI
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 2. POS */}
                          <td className="py-2.5 px-3 align-top">
                            <select
                              value={normalizePos(item.part_of_speech || item.pos)}
                              onChange={(e) => handleUpdatePreview(idx, "part_of_speech", e.target.value)}
                              className="w-full bg-zinc-50 dark:bg-zinc-800/60 rounded px-2 py-1.5 border border-zinc-200 dark:border-zinc-700 text-xs text-center font-medium focus:border-brand-500 outline-none"
                            >
                              <option value="noun">noun (n)</option>
                              <option value="verb">verb (v)</option>
                              <option value="adjective">adjective (adj)</option>
                              <option value="adverb">adverb (adv)</option>
                              <option value="phrase">phrase</option>
                              <option value="idiom">idiom</option>
                              <option value="phrasal_verb">phrasal verb</option>
                            </select>
                          </td>

                          {/* 3. Uzbek Translation */}
                          <td className="py-2.5 px-3 align-top">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 shrink-0 font-mono">
                                UZ
                              </span>
                              <input
                                type="text"
                                value={item.uzbek_translation || item.custom_translation || ""}
                                onChange={(e) => handleUpdatePreview(idx, "uzbek_translation", e.target.value)}
                                placeholder="O'zbekcha tarjimasi..."
                                className="w-full bg-zinc-50 dark:bg-zinc-800/60 rounded px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-700 text-xs font-medium focus:border-brand-500 outline-none"
                              />
                            </div>
                          </td>

                          {/* 4. English Definition */}
                          <td className="py-2.5 px-3 align-top">
                            <textarea
                              rows={2}
                              value={item.definition || ""}
                              onChange={(e) => handleUpdatePreview(idx, "definition", e.target.value)}
                              placeholder="English definition..."
                              className="w-full bg-zinc-50 dark:bg-zinc-800/60 rounded px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-700 text-xs resize-y focus:border-brand-500 outline-none"
                            />
                          </td>

                          {/* 5. Example Sentence */}
                          <td className="py-2.5 px-3 align-top">
                            <textarea
                              rows={2}
                              value={item.example_sentence || item.example || ""}
                              onChange={(e) => handleUpdatePreview(idx, "example_sentence", e.target.value)}
                              placeholder="Cambridge context example sentence..."
                              className="w-full bg-zinc-50 dark:bg-zinc-800/60 rounded px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-700 text-xs italic resize-y focus:border-brand-500 outline-none"
                            />
                          </td>

                          {/* 6. Audio */}
                          <td className="py-2.5 px-3 text-center align-top">
                            <div className="inline-flex items-center justify-center gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() => handlePlayPreviewAudio(item)}
                                className="p-1.5 rounded-lg text-brand-600 hover:text-brand-700 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition active:scale-95"
                                title="Listen to pronunciation (Audio or Speech Synthesis)"
                              >
                                <Volume2 className="w-4 h-4" />
                              </button>
                              <span
                                className={`text-[9px] px-1 py-0.5 rounded font-mono ${
                                  item.audio_us_url
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-bold"
                                    : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
                                }`}
                                title={item.audio_us_url ? "US Audio Available" : "Web Speech Synthesis Fallback"}
                              >
                                US
                              </span>
                            </div>
                          </td>

                          {/* 7. Action: Delete Row */}
                          <td className="py-2.5 px-3 text-center align-top">
                            <button
                              type="button"
                              onClick={() => handleRemovePreview(idx)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition mt-1"
                              title="Remove item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleSaveSet}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition active:scale-95 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Saving Wordlist...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>💾 Save & Publish Wordlist</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Practice Flashcard Modal */}
        <Modal
          open={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          title={activeSetDetail?.title ?? "Flashcard Practice"}
        >
          <div className="py-2">
            {isLoadingDetail ? (
              <div className="p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-brand-600 mx-auto" />
                <p className="text-xs text-zinc-400 mt-2">Loading flashcards...</p>
              </div>
            ) : activeSetDetail ? (
              <FlashcardDeck
                items={activeSetDetail.items}
                title={activeSetDetail.title}
                onClose={() => setPreviewModalOpen(false)}
              />
            ) : null}
          </div>
        </Modal>
      </div>
    </ErrorBoundary>
  );
}
