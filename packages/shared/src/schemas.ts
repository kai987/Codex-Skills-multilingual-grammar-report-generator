import { z } from "zod";
import { languageTagSchema } from "./language.js";

// Retained only to validate optional metadata on imported subtitle packages.
const coreMLProbeStatusSchema = z.enum([
  "unsupported-platform",
  "not-compiled",
  "encoder-missing",
  "encoder-mismatch",
  "load-failed",
  "available",
  "disabled-by-user",
]);

export const schemaVersionSchema = z.literal("1.0.0");

export const subtitleCueSourceLayerSchema = z.enum([
  "baseline-vad",
  "scene-extra-sensitive-vad",
  "no-vad",
  "large-v3-refinement",
  "recovery",
  "c5-3-occurrence-recovery",
  "c5-4-acoustic-text-recovery",
  "c5-11-sequence-recovery",
  "c5-12-hallucination-recovery",
  "c5-13-human-review",
  "c5-13-non-lexical",
  "lyrics-asr",
  "reference-original-language",
  "embedded",
  "online",
]);

export const subtitleCueProvenanceSchema = z
  .object({
    sourceLayer: subtitleCueSourceLayerSchema,
    sourceRequestIds: z.array(z.string().min(1)).default([]),
    sourceProfileIds: z.array(z.string().min(1)).default([]),
    referenceAnchorIds: z.array(z.string().min(1)).default([]),
    historicalReferenceAnchorIds: z.array(z.string().min(1)).optional(),
    stableReferenceAnchorIds: z.array(z.string().min(1)).optional(),
    referenceUnitIds: z.array(z.string().min(1)).default([]),
    recoveryUnitId: z.string().min(1).nullable().default(null),
    sceneId: z.string().min(1).nullable().default(null),
    sceneLabel: z.string().min(1).nullable().default(null),
    independentSupportCount: z.number().int().nonnegative().default(0),
    qualityScore: z.number().min(0).max(1).nullable().default(null),
  })
  .strict();

export type SubtitleCueProvenance = z.infer<typeof subtitleCueProvenanceSchema>;

export const subtitleCueTextAuditSchema = z
  .object({
    rawAsrText: z.string(),
    repairedText: z.string(),
    normalizedText: z.string(),
    winnerClusterIds: z.array(z.string().min(1)).default([]),
    sourceWinnerCueIds: z.array(z.string().min(1)).default([]),
    winnerScore: z.number().min(0).max(1).nullable().optional(),
    runnerUpCueId: z.string().min(1).nullable().optional(),
    runnerUpScore: z.number().min(0).max(1).nullable().optional(),
    scoreGap: z.number().min(0).max(1).nullable().optional(),
    replacements: z
      .array(
        z
          .object({
            original: z.string().min(1),
            replacement: z.string().min(1),
            category: z.string().min(1),
            confidence: z.number().min(0).max(1),
            evidence: z.array(z.string().min(1)),
          })
          .strict(),
      )
      .default([]),
    deduplicationActions: z.array(z.string().min(1)).default([]),
    repairType: z.string().min(1).nullable().optional(),
    timingDonorCueId: z.string().min(1).nullable().optional(),
    timingRepairMethod: z.string().min(1).nullable().optional(),
    reviewRecommended: z.boolean(),
    reviewReasons: z.array(z.string().min(1)),
  })
  .strict();

export type SubtitleCueTextAudit = z.infer<typeof subtitleCueTextAuditSchema>;

export const subtitleCueSchema = z
  .object({
    id: z.string().min(1),
    start: z.number().nonnegative(),
    end: z.number().positive(),
    language: languageTagSchema,
    languages: z.array(languageTagSchema).min(1),
    text: z.string().min(1),
    style: z.enum(["default", "thought", "music"]).optional(),
    textSource: z
      .enum(["audio-asr", "reference-original-language", "embedded", "online"])
      .optional(),
    speaker: z.string().min(1).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    provenance: subtitleCueProvenanceSchema.optional(),
    textAudit: subtitleCueTextAuditSchema.optional(),
    transcriptionMetrics: z
      .object({
        averageLogProbability: z.number().nullable().optional(),
        noSpeechProbability: z.number().min(0).max(1).nullable().optional(),
        tokenProbability: z.number().min(0).max(1).nullable().optional(),
        entropy: z.number().nonnegative().nullable().optional(),
        decoderFallback: z.boolean().nullable().optional(),
        detectedLanguage: languageTagSchema.nullable().optional(),
      })
      .strict()
      .optional(),
    timingEvidence: z
      .object({
        sourceTrusted: z.boolean().default(false),
        speechStart: z.number().nonnegative().nullable(),
        speechEnd: z.number().positive().nullable(),
        tokenTimestampsAvailable: z.boolean().default(false),
        tokenTimestampsValidated: z.boolean().default(false).optional(),
        tokenTimestampsUsed: z.boolean().default(false),
        tokens: z
          .array(
            z
              .object({
                text: z.string(),
                start: z.number().nonnegative(),
                end: z.number().nonnegative(),
                probability: z.number().min(0).max(1).nullable().optional(),
              })
              .strict()
              .refine((token) => token.end >= token.start, {
                message: "Token end must be at or after token start.",
              }),
          )
          .default([]),
        alignmentSource: z.enum([
          "source",
          "token",
          "speech",
          "vad",
          "segment",
          "pause",
          "semantic",
          "character-ratio",
        ]),
        presentationTimingMethod: z
          .enum([
            "preserved-source",
            "token",
            "speech-boundary",
            "pause",
            "semantic",
            "vad",
            "character-ratio",
          ])
          .nullable()
          .default(null),
        chunkBoundaryConflict: z.boolean().optional(),
        speechIntervals: z
          .array(
            z
              .object({
                start: z.number().nonnegative(),
                end: z.number().positive(),
              })
              .strict()
              .refine((interval) => interval.end > interval.start, {
                message: "Speech interval end must be greater than start.",
              }),
          )
          .optional(),
        speechBoundarySource: z.enum(["silence", "vad", "segment"]).optional(),
        originalStart: z.number().nonnegative().optional(),
        originalEnd: z.number().positive().optional(),
        boundaryChangedToAvoidOverlap: z.boolean().optional(),
        boundaryChangeReason: z.string().min(1).optional(),
        timingEvidenceUsed: z.array(z.string().min(1)).optional(),
        timingRecoveryMethod: z.string().min(1).nullable().optional(),
        timingRecoveryUnitId: z.string().min(1).nullable().optional(),
        timingDonorCueId: z.string().min(1).nullable().optional(),
        timingDonorSource: z.string().min(1).nullable().optional(),
        timingDonorConfidence: z.number().min(0).max(1).optional(),
        timingRiskScore: z.number().min(0).max(100).optional(),
        timingRiskBand: z
          .enum(["pass", "suspicious", "auto-realign", "mandatory-realign"])
          .optional(),
        acousticEvidenceValidated: z.boolean().optional(),
        speechPresenceValidated: z.boolean().optional(),
        textLocalizationValidated: z.boolean().optional(),
        textLocalizationMethod: z
          .enum([
            "own-token",
            "external-token",
            "trusted-source",
            "same-locus-consensus",
            "targeted-asr",
            "unresolved",
          ])
          .optional(),
        textLocalizationConfidence: z.number().min(0).max(1).optional(),
        timingLocusConflict: z.boolean().optional(),
        timingLocusIds: z.array(z.string().min(1)).optional(),
        selectedTimingLocusId: z.string().min(1).nullable().optional(),
        selectedTimingLocusScore: z.number().nonnegative().optional(),
        competingTimingLocusScores: z
          .array(
            z
              .object({
                locusId: z.string().min(1),
                score: z.number().nonnegative(),
              })
              .strict(),
          )
          .optional(),
        externalTokenDonorCueId: z.string().min(1).nullable().optional(),
        startBoundarySource: z.string().min(1).optional(),
        endBoundarySource: z.string().min(1).optional(),
        startBoundaryConfidence: z.number().min(0).max(1).optional(),
        endBoundaryConfidence: z.number().min(0).max(1).optional(),
        contentRestorationApplied: z.boolean().optional(),
        restoredSemanticText: z.string().min(1).nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((cue) => cue.end > cue.start, {
    message: "Cue end must be greater than cue start.",
  });

export type SubtitleCue = z.infer<typeof subtitleCueSchema>;

const relativeArtifactPathSchema = z
  .string()
  .min(1)
  .regex(/^(?!\/)(?![A-Za-z]:[\\/]).+/u, "Path must be relative.");

export const subtitlePackageSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    phase: z.enum(["pre-final", "final"]).optional(),
    finalCueCount: z.number().int().nonnegative().optional(),
    finalCueSetHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    packageType: z.literal("multilingual-subtitle-package"),
    status: z.enum([
      "ready",
      "needs-review",
      "needs-subtitle-selection",
      "needs-subtitle-search",
      "needs-audio-transcription",
      "no-text-subtitle",
    ]),
    sourceLanguage: languageTagSchema,
    detectedLanguages: z.array(languageTagSchema),
    source: z
      .object({
        fileName: z.string().min(1),
        container: z.string().min(1).nullable(),
        durationSeconds: z.number().nonnegative(),
      })
      .strict(),
    identity: z
      .object({
        title: z.string().min(1).nullable(),
        season: z.number().int().positive().nullable(),
        episode: z.number().int().positive().nullable(),
        year: z.number().int().min(1888).max(2200).nullable(),
      })
      .strict(),
    primarySubtitle: z
      .object({
        language: languageTagSchema,
        sourceType: z.enum(["embedded", "online", "transcription"]),
        validationStatus: z.enum(["validated", "needs-review", "rejected"]),
        streamIndex: z.number().int().nonnegative().nullable(),
      })
      .strict()
      .nullable(),
    subtitleFiles: z
      .object({
        srt: relativeArtifactPathSchema.nullable(),
        vtt: relativeArtifactPathSchema.nullable(),
        ass: relativeArtifactPathSchema.nullable(),
      })
      .strict(),
    referenceSubtitles: z.array(
      z
        .object({
          language: languageTagSchema,
          path: relativeArtifactPathSchema,
          matchScore: z.number().min(0).max(100),
        })
        .strict(),
    ),
    video: z
      .object({
        sourcePath: z.null(),
        subtitledPath: relativeArtifactPathSchema.nullable(),
      })
      .strict(),
    cues: z.array(subtitleCueSchema),
    warnings: z.array(z.string()),
    referenceGuidance: z
      .object({
        mode: z.enum([
          "reference-free",
          "reference-assisted",
          "reference-guided",
        ]),
        referenceLanguage: languageTagSchema.nullable(),
        blindGenerationProofPath: relativeArtifactPathSchema.nullable(),
        analysisPath: relativeArtifactPathSchema.nullable(),
        classificationReviewPath: relativeArtifactPathSchema
          .nullable()
          .optional(),
        timelinePath: relativeArtifactPathSchema.nullable(),
        alignmentPath: relativeArtifactPathSchema.nullable(),
        evaluationPath: relativeArtifactPathSchema.nullable(),
        coverageIntegrityPath: relativeArtifactPathSchema.nullable(),
        coverageRecoveryPlanPath: relativeArtifactPathSchema
          .nullable()
          .optional(),
        coverageRecoveryResultsPath: relativeArtifactPathSchema
          .nullable()
          .optional(),
        referenceTextUsedAsTargetPrompt: z.literal(false),
      })
      .strict()
      .optional(),
    transcription: z
      .object({
        provider: z.string().min(1),
        strategy: z.enum(["quality", "fast", "adaptive"]),
        coreML: z
          .object({
            status: coreMLProbeStatusSchema,
            fallback: z
              .object({
                from: z.string().min(1),
                to: z.string().min(1),
                reason: z.string().min(1),
              })
              .strict()
              .nullable(),
          })
          .strict()
          .optional(),
        qualitySummary: z
          .object({
            accepted: z.number().int().nonnegative(),
            refined: z.number().int().nonnegative(),
            needsHumanReview: z.number().int().nonnegative(),
            vadNoVadConflicts: z.number().int().nonnegative().optional(),
            resolvedByLargeV3: z.number().int().nonnegative().optional(),
            suspectedHallucinations: z.number().int().nonnegative().optional(),
            probableNonSpeech: z.number().int().nonnegative().optional(),
            autoResolvedVad: z.number().int().nonnegative().optional(),
            autoResolvedNoVad: z.number().int().nonnegative().optional(),
            autoResolvedLargeV3: z.number().int().nonnegative().optional(),
            rejectedVadHallucinations: z
              .number()
              .int()
              .nonnegative()
              .optional(),
            rejectedNoVadHallucinations: z
              .number()
              .int()
              .nonnegative()
              .optional(),
            trueUnresolvedConflicts: z.number().int().nonnegative().optional(),
          })
          .strict(),
        canonicalSegmentation: z
          .object({
            artifactPath: relativeArtifactPathSchema,
            rawSegmentCount: z.number().int().nonnegative(),
            canonicalUtteranceCount: z.number().int().nonnegative(),
          })
          .strict()
          .optional(),
        missingDialogueRecovery: z
          .object({
            artifactPath: relativeArtifactPathSchema,
            inputReviewGroups: z.number().int().nonnegative(),
            recoveryUnits: z.number().int().nonnegative(),
            recoveredUnits: z.number().int().nonnegative(),
            probableNonSpeechUnits: z.number().int().nonnegative(),
            suspectedHallucinationUnits: z.number().int().nonnegative(),
            stillNeedsReviewUnits: z.number().int().nonnegative(),
            autoCreatedFinalCues: z.number().int().nonnegative(),
            closedMissingDialogueReviews: z.number().int().nonnegative(),
            recoveryAsrRequests: z.number().int().nonnegative(),
            cacheHits: z.number().int().nonnegative(),
            profileAttempts: z
              .object({
                "current-sensitive-vad": z.number().int().nonnegative(),
                "extra-sensitive-vad": z.number().int().nonnegative(),
                "no-vad": z.number().int().nonnegative(),
              })
              .strict(),
          })
          .strict()
          .optional(),
        lyricsTranscription: z
          .object({
            artifactPath: relativeArtifactPathSchema,
            detectedSongRegions: z.number().int().nonnegative(),
            lyricsAcceptedRegions: z.number().int().nonnegative(),
            missingLyricsRegions: z.number().int().nonnegative(),
            musicCueCount: z.number().int().nonnegative(),
            lyricsAsrRequests: z.number().int().nonnegative(),
            cacheHits: z.number().int().nonnegative(),
          })
          .strict()
          .optional(),
        sceneAnalysis: z
          .object({
            windowsArtifactPath: relativeArtifactPathSchema,
            scenesArtifactPath: relativeArtifactPathSchema,
            routingPlanArtifactPath: relativeArtifactPathSchema,
            status: z.enum(["completed", "failed"]),
            mode: z.enum(["off", "observe", "route"]),
            routingMode: z.enum(["conservative", "balanced", "aggressive"]),
            sceneCount: z.number().int().nonnegative(),
            proactiveNoVadScenes: z.number().int().nonnegative(),
            proactiveExtraSensitiveVadScenes: z.number().int().nonnegative(),
            proactiveLyricsScenes: z.number().int().nonnegative(),
            noVadRequests: z.number().int().nonnegative(),
            extraSensitiveVadRequests: z.number().int().nonnegative(),
            lyricsRequests: z.number().int().nonnegative(),
            cacheHits: z.number().int().nonnegative(),
          })
          .strict()
          .optional(),
        finalSubtitleIntegrity: z
          .object({
            artifactPath: relativeArtifactPathSchema,
            validationStatus: z.enum(["passed", "needs-review"]),
            finalCueCount: z.number().int().nonnegative(),
            quarantinedCueCount: z.number().int().nonnegative(),
            hardFindingCount: z.number().int().nonnegative(),
            subtitleCoverageRatio: z.number().min(0).max(1),
          })
          .strict()
          .optional(),
        textIntegrityRepair: z
          .object({
            artifactPath: relativeArtifactPathSchema,
            attempted: z.number().int().nonnegative(),
            succeeded: z.number().int().nonnegative(),
            stillHardBlocked: z.number().int().nonnegative(),
          })
          .strict()
          .optional(),
        finalSubtitleRepair: z
          .object({
            artifactPath: relativeArtifactPathSchema,
            repaired: z.number().int().nonnegative(),
            unresolved: z.number().int().nonnegative(),
          })
          .strict()
          .optional(),
        timingRecovery: z
          .object({
            mode: z.enum(["off", "auto", "deep"]),
            planPath: relativeArtifactPathSchema,
            resultsPath: relativeArtifactPathSchema,
            timedTokenAlignmentPath: relativeArtifactPathSchema,
            donorResolutionPath: relativeArtifactPathSchema,
            boundaryOptimizationPath: relativeArtifactPathSchema,
            coreMLCanaryPath: relativeArtifactPathSchema,
            backendSelectionPath: relativeArtifactPathSchema,
            timingLocusHypothesesPath: relativeArtifactPathSchema.optional(),
            timingLocusConflictsPath: relativeArtifactPathSchema.optional(),
            timingLocusContentRecoveryPath:
              relativeArtifactPathSchema.optional(),
          })
          .strict()
          .optional(),
        finalDialogueCoverage: z
          .object({
            coverageMapPath: relativeArtifactPathSchema,
            gapAnalysisPath: relativeArtifactPathSchema,
            resurrectionPath: relativeArtifactPathSchema,
            spokenRepetitionPath: relativeArtifactPathSchema,
            referenceSpeechAuditPath: relativeArtifactPathSchema,
            referenceAnchorIntegrityPath: relativeArtifactPathSchema,
            reportPath: relativeArtifactPathSchema,
            serializedAuditPath: relativeArtifactPathSchema,
            finalCueCountBefore: z.number().int().nonnegative(),
            finalCueCountAfter: z.number().int().nonnegative(),
            resurrectedSemanticUtteranceCount: z.number().int().nonnegative(),
            unresolvedSpeechGapCount: z.number().int().nonnegative(),
            reviewSummary: z
              .object({
                timingReviewCount: z.number().int().nonnegative(),
                coverageReviewCount: z.number().int().nonnegative(),
                contentReviewCount: z.number().int().nonnegative(),
                languageReviewCount: z.number().int().nonnegative(),
                totalReviewCount: z.number().int().nonnegative(),
              })
              .strict(),
          })
          .strict()
          .optional(),
        decisionArchitecture: z
          .object({
            phase: z.literal("final"),
            policyInventoryPath: relativeArtifactPathSchema,
            evidenceLedgerPath: relativeArtifactPathSchema,
            decisionLedgerPath: relativeArtifactPathSchema,
            spokenOccurrencePath: relativeArtifactPathSchema,
            winnerVerificationPath: relativeArtifactPathSchema,
            futureLeakagePath: relativeArtifactPathSchema,
            coverageEvidenceTierPath: relativeArtifactPathSchema,
            finalReviewQueuePath: relativeArtifactPathSchema,
            finalArtifactIdentityPath: relativeArtifactPathSchema,
            finalCueCount: z.number().int().nonnegative(),
            canonicalFinalCueSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
            targetedAsrRequestCount: z.number().int().nonnegative(),
            targetedAsrCacheHitCount: z.number().int().nonnegative(),
            unresolvedSpokenTextCount: z.number().int().nonnegative(),
            wholeEpisodeWhisperRerun: z.literal(false),
          })
          .strict()
          .optional(),
        finalAudioVerification: z
          .object({
            coverageMapPath: relativeArtifactPathSchema,
            cueVerificationPath: relativeArtifactPathSchema,
            timingDriftPath: relativeArtifactPathSchema,
            textMismatchPath: relativeArtifactPathSchema,
            unsubtitledSpeechPath: relativeArtifactPathSchema,
            targetedVerificationPath: relativeArtifactPathSchema,
            continuousDriftPath: relativeArtifactPathSchema,
            reportPath: relativeArtifactPathSchema,
            validationStatus: z.enum(["complete", "needs-review"]),
            finalCueCount: z.number().int().nonnegative(),
            canonicalFinalCueSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
            targetedAsrRequestCount: z.number().int().nonnegative(),
            wholeEpisodeWhisperRerun: z.literal(false),
          })
          .strict()
          .optional(),
        acousticTextRecovery: z
          .object({
            mode: z.enum(["off", "observe", "recover"]),
            occurrenceCueBindingPath: relativeArtifactPathSchema,
            phoneticConsensusPath: relativeArtifactPathSchema,
            asrIndependenceCalibrationPath: relativeArtifactPathSchema,
            historicalCandidateRerankingPath: relativeArtifactPathSchema,
            shortUtteranceRecoveryPath: relativeArtifactPathSchema,
            targetedAsrPlanPath: relativeArtifactPathSchema,
            occurrenceTimingAlignmentPath: relativeArtifactPathSchema,
            occurrenceTimingDriftAuditPath: relativeArtifactPathSchema,
            finalOccurrenceCoveragePath: relativeArtifactPathSchema,
            finalChangeAuditPath: relativeArtifactPathSchema,
            reportPath: relativeArtifactPathSchema,
            validationStatus: z.enum(["complete", "needs-review"]),
            finalCueCount: z.number().int().nonnegative(),
            canonicalFinalCueSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
            targetedAsrRequestCount: z.number().int().nonnegative(),
            targetedAsrCacheHitCount: z.number().int().nonnegative(),
            wholeEpisodeWhisperRerun: z.literal(false),
          })
          .strict()
          .optional(),
        unsubtitledSpeechRecovery: z
          .object({
            mode: z.enum(["off", "observe", "recover"]),
            candidateAtomizationPath: relativeArtifactPathSchema,
            candidateOccurrenceAssignmentPath: relativeArtifactPathSchema,
            recoveryQueuePath: relativeArtifactPathSchema,
            candidateAcousticVerificationPath: relativeArtifactPathSchema,
            historicalCandidateResurrectionPath: relativeArtifactPathSchema,
            neighborLeakageCalibrationPath: relativeArtifactPathSchema,
            occurrenceStructureRecalibrationPath: relativeArtifactPathSchema,
            targetedAsrPlanPath: relativeArtifactPathSchema,
            finalOccurrenceCoveragePath: relativeArtifactPathSchema,
            finalChangeAuditPath: relativeArtifactPathSchema,
            reportPath: relativeArtifactPathSchema,
            validationStatus: z.enum(["complete", "needs-review"]),
            finalCueCount: z.number().int().nonnegative(),
            canonicalFinalCueSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
            targetedAsrRequestCount: z.number().int().nonnegative(),
            targetedAsrCacheHitCount: z.number().int().nonnegative(),
            wholeEpisodeWhisperRerun: z.literal(false),
          })
          .strict()
          .optional(),
        candidateTextRelocalization: z
          .object({
            mode: z.enum(["off", "observe", "recover"]),
            candidateRelocalizationPath: relativeArtifactPathSchema,
            wrongTimingResurrectionPath: relativeArtifactPathSchema,
            coverageShadowAuditPath: relativeArtifactPathSchema,
            recomputedCoveragePath: relativeArtifactPathSchema,
            mergeSplitRecalibrationPath: relativeArtifactPathSchema,
            recoveryQueuePath: relativeArtifactPathSchema,
            targetedAsrPlanPath: relativeArtifactPathSchema,
            finalChangeAuditPath: relativeArtifactPathSchema,
            reportPath: relativeArtifactPathSchema,
            validationStatus: z.enum(["complete", "needs-review"]),
            finalCueCount: z.number().int().nonnegative(),
            canonicalFinalCueSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
            targetedAsrRequestCount: z.number().int().nonnegative(),
            targetedAsrCacheHitCount: z.number().int().nonnegative(),
            wholeEpisodeWhisperRerun: z.literal(false),
          })
          .strict()
          .optional(),
        evidenceGainRecovery: z
          .object({
            mode: z.enum(["off", "observe", "recover"]),
            evidenceGainSchedulePath: relativeArtifactPathSchema,
            candidateSpecificAlignmentPath: relativeArtifactPathSchema,
            multipleLocusDisambiguationPath: relativeArtifactPathSchema,
            oneMoreEvidenceCandidatesPath: relativeArtifactPathSchema,
            targetedAsrBudgetExecutionPath: relativeArtifactPathSchema,
            recoveryQueuePath: relativeArtifactPathSchema,
            finalChangeAuditPath: relativeArtifactPathSchema,
            reportPath: relativeArtifactPathSchema,
            validationStatus: z.enum(["complete", "needs-review"]),
            finalCueCount: z.number().int().nonnegative(),
            canonicalFinalCueSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
            targetedAsrRequestCount: z.number().int().nonnegative(),
            targetedAsrCacheHitCount: z.number().int().nonnegative(),
            wholeEpisodeWhisperRerun: z.literal(false),
          })
          .strict()
          .optional(),
        decisionPolicyCalibration: z
          .object({
            mode: z.enum(["off", "observe", "recover"]),
            canonicalLocusRankingAuditPath: relativeArtifactPathSchema,
            marginPolicyAuditPath: relativeArtifactPathSchema,
            directUniqueLocusRecoveryPath: relativeArtifactPathSchema,
            decisionGateAuditPath: relativeArtifactPathSchema,
            evidenceDimensionAggregationPath: relativeArtifactPathSchema,
            duplicateEvidencePenaltyAuditPath: relativeArtifactPathSchema,
            circularEvidenceDependencyAuditPath: relativeArtifactPathSchema,
            counterfactualPath: relativeArtifactPathSchema,
            nearMissCandidatesPath: relativeArtifactPathSchema,
            postAsrDecisionTracePath: relativeArtifactPathSchema,
            acceptancePathDecisionsPath: relativeArtifactPathSchema,
            recoveryQueuePath: relativeArtifactPathSchema,
            finalChangeAuditPath: relativeArtifactPathSchema,
            reportPath: relativeArtifactPathSchema,
            validationStatus: z.enum(["complete", "needs-review"]),
            finalCueCount: z.number().int().nonnegative(),
            canonicalFinalCueSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
            targetedAsrRequestCount: z.number().int().nonnegative(),
            targetedAsrCacheHitCount: z.number().int().nonnegative(),
            wholeEpisodeWhisperRerun: z.literal(false),
          })
          .strict()
          .optional(),
        timingGroundingMaterialization: z
          .object({
            mode: z.enum(["off", "observe", "recover"]),
            materializationAuditPath: relativeArtifactPathSchema,
            occurrenceWinnerSelectionPath: relativeArtifactPathSchema,
            timingGroundingAuditPath: relativeArtifactPathSchema,
            timingNearMissCandidatesPath: relativeArtifactPathSchema,
            timingRepairsPath: relativeArtifactPathSchema,
            overlapClassificationPath: relativeArtifactPathSchema,
            coverageRecheckPath: relativeArtifactPathSchema,
            semanticDuplicateAuditPath: relativeArtifactPathSchema,
            timingPolicyCounterfactualPath: relativeArtifactPathSchema,
            materializationFunnelPath: relativeArtifactPathSchema,
            recoveryQueuePath: relativeArtifactPathSchema,
            finalChangeAuditPath: relativeArtifactPathSchema,
            reportPath: relativeArtifactPathSchema,
            validationStatus: z.enum(["complete", "needs-review"]),
            finalCueCount: z.number().int().nonnegative(),
            canonicalFinalCueSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
            targetedTimingRequestCount: z.number().int().nonnegative(),
            targetedTimingCacheHitCount: z.number().int().nonnegative(),
            wholeEpisodeWhisperRerun: z.literal(false),
          })
          .strict()
          .optional(),
        targetedTimingEvidence: z
          .object({
            mode: z.enum(["off", "observe", "recover"]),
            queuePath: relativeArtifactPathSchema,
            auditPath: relativeArtifactPathSchema,
            candidateConditionedAlignmentPath: relativeArtifactPathSchema,
            tokenLocusRecoveryPath: relativeArtifactPathSchema,
            boundaryNearMissRepairPath: relativeArtifactPathSchema,
            occurrenceCoreMismatchAuditPath: relativeArtifactPathSchema,
            occurrenceInternalSegmentationPath: relativeArtifactPathSchema,
            overlapConflictResolutionPath: relativeArtifactPathSchema,
            overwideExistingCueShadowAuditPath: relativeArtifactPathSchema,
            neighborBoundaryDriftRepairPath: relativeArtifactPathSchema,
            timingPolicyCounterfactualPath: relativeArtifactPathSchema,
            postTimingEvidenceDecisionTracePath: relativeArtifactPathSchema,
            materializationFunnelPath: relativeArtifactPathSchema,
            finalChangeAuditPath: relativeArtifactPathSchema,
            reportPath: relativeArtifactPathSchema,
            validationStatus: z.enum(["complete", "needs-review"]),
            finalCueCount: z.number().int().nonnegative(),
            canonicalFinalCueSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
            targetedTimingRequestCount: z.number().int().nonnegative(),
            targetedTimingCacheHitCount: z.number().int().nonnegative(),
            wholeEpisodeWhisperRerun: z.literal(false),
          })
          .strict()
          .optional(),
        localDialogueSequence: z
          .object({
            mode: z.enum(["off", "observe", "recover"]),
            humanEvidencePath: relativeArtifactPathSchema.nullable(),
            proposalsPath: relativeArtifactPathSchema,
            compoundGroupsPath: relativeArtifactPathSchema,
            internalSegmentationPath: relativeArtifactPathSchema,
            repeatedPhraseFamiliesPath: relativeArtifactPathSchema,
            textVariantArbitrationPath: relativeArtifactPathSchema,
            locusTheftAuditPath: relativeArtifactPathSchema,
            localOwnershipProtectionPath: relativeArtifactPathSchema,
            monotonicAlignmentPath: relativeArtifactPathSchema,
            sequenceHypothesisDecisionsPath: relativeArtifactPathSchema,
            existingCueBoundaryReevaluationPath: relativeArtifactPathSchema,
            overlapResolutionPath: relativeArtifactPathSchema,
            displayGroupingPath: relativeArtifactPathSchema,
            decisionTracePath: relativeArtifactPathSchema,
            finalChangeAuditPath: relativeArtifactPathSchema,
            reportPath: relativeArtifactPathSchema,
            validationStatus: z.enum(["complete", "needs-review"]),
            finalCueCount: z.number().int().nonnegative(),
            canonicalFinalCueSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
            sequenceEvidenceRequestCount: z.number().int().nonnegative(),
            sequenceEvidenceCacheHitCount: z.number().int().nonnegative(),
            wholeEpisodeWhisperRerun: z.literal(false),
          })
          .strict()
          .optional(),
        hallucinationSequenceGeneralization: z
          .object({
            mode: z.enum(["off", "observe", "recover"]),
            hallucinationRecoveryMode: z.enum(["off", "observe", "recover"]),
            automaticSequenceDiscoveryMode: z.enum(["off", "observe"]),
            humanEvidencePath: relativeArtifactPathSchema,
            hallucinationAuditPath: relativeArtifactPathSchema,
            hallucinationQueuePath: relativeArtifactPathSchema,
            candidateFamiliesPath: relativeArtifactPathSchema,
            internalSegmentationPath: relativeArtifactPathSchema,
            candidateVerificationPath: relativeArtifactPathSchema,
            hallucinationContrastPath: relativeArtifactPathSchema,
            hallucinationDecisionTracePath: relativeArtifactPathSchema,
            automaticSequenceProposalsPath: relativeArtifactPathSchema,
            automaticSequenceTracePath: relativeArtifactPathSchema,
            sequenceGeneralizationAuditPath: relativeArtifactPathSchema,
            sequenceLeaveOneSignalOutPath: relativeArtifactPathSchema,
            sequenceFalsePositiveAuditPath: relativeArtifactPathSchema,
            automaticSequenceReviewQueuePath: relativeArtifactPathSchema,
            sequenceReviewPackManifestPath: relativeArtifactPathSchema,
            finalChangeAuditPath: relativeArtifactPathSchema,
            reportPath: relativeArtifactPathSchema,
            validationStatus: z.enum(["complete", "needs-review"]),
            finalCueCount: z.number().int().nonnegative(),
            canonicalFinalCueSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
            hallucinationRecoveryRequestCount: z.number().int().nonnegative(),
            hallucinationRecoveryCacheHitCount: z.number().int().nonnegative(),
            automaticSequenceFinalMutationCount: z.literal(0),
            wholeEpisodeWhisperRerun: z.literal(false),
          })
          .strict()
          .optional(),
        lexicalSpeechCoverage: z
          .object({
            mode: z.enum(["off", "observe", "recover"]),
            coverageMode: z.enum(["machine-safe", "complete"]),
            nonLexicalSubtitleMode: z.enum(["omit", "include"]),
            speechTypeClassificationPath: relativeArtifactPathSchema,
            accountabilityLedgerPath: relativeArtifactPathSchema,
            triagePath: relativeArtifactPathSchema,
            recoveryRoutingPath: relativeArtifactPathSchema,
            coverageBindingRepairPath: relativeArtifactPathSchema,
            nonLexicalAuditPath: relativeArtifactPathSchema,
            segmentationReassessmentPath: relativeArtifactPathSchema,
            phoneticFirstRecoveryPath: relativeArtifactPathSchema,
            forcedAlignmentPath: relativeArtifactPathSchema,
            textConditionedTimingPath: relativeArtifactPathSchema,
            sequenceRoutingPath: relativeArtifactPathSchema,
            repeatedShortUtterancePath: relativeArtifactPathSchema,
            overlapBoundaryPath: relativeArtifactPathSchema,
            mandatoryReviewQueuePath: relativeArtifactPathSchema,
            reviewPackManifestPath: relativeArtifactPathSchema,
            humanReviewResolutionPath: relativeArtifactPathSchema,
            coverageCertificationPath: relativeArtifactPathSchema,
            finalChangeAuditPath: relativeArtifactPathSchema,
            reportPath: relativeArtifactPathSchema,
            validationStatus: z.enum(["complete", "needs-review", "failed"]),
            finalCueCount: z.number().int().nonnegative(),
            canonicalFinalCueSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
            humanReviewRequiredLexicalCount: z.number().int().nonnegative(),
            reviewQueueCount: z.number().int().nonnegative(),
            machineSafeCoveragePassed: z.boolean(),
            coverageCompletePassed: z.boolean(),
            boundedRequestCount: z.number().int().nonnegative(),
            wholeEpisodeWhisperRerun: z.literal(false),
          })
          .strict()
          .optional(),
        humanReviewResolution: z
          .object({
            mode: z.enum(["observe", "apply"]),
            coverageMode: z.enum(["machine-safe", "complete"]),
            resolutionsTemplatePath: relativeArtifactPathSchema,
            resolutionsPath: relativeArtifactPathSchema,
            validationPath: relativeArtifactPathSchema,
            evidenceLedgerPath: relativeArtifactPathSchema,
            dependencyGraphPath: relativeArtifactPathSchema,
            counterfactualPath: relativeArtifactPathSchema,
            applicationPath: relativeArtifactPathSchema,
            conflictsPath: relativeArtifactPathSchema,
            roundManifestPath: relativeArtifactPathSchema,
            queueAfterResolutionPath: relativeArtifactPathSchema,
            progressReportPath: relativeArtifactPathSchema,
            timingAlignmentPath: relativeArtifactPathSchema,
            sequenceResolutionPath: relativeArtifactPathSchema,
            coverageBindingsPath: relativeArtifactPathSchema,
            finalChangeAuditPath: relativeArtifactPathSchema,
            reportPath: relativeArtifactPathSchema,
            finalArtifactIdentityPath: relativeArtifactPathSchema,
            validationStatus: z.enum(["complete", "needs-review", "failed"]),
            finalCueCount: z.number().int().nonnegative(),
            canonicalFinalCueSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
            reviewResolutionInputCount: z.number().int().nonnegative(),
            reviewResolvedCount: z.number().int().nonnegative(),
            reviewOpenCount: z.number().int().nonnegative(),
            reviewBlockedCount: z.number().int().nonnegative(),
            humanReviewRequiredLexicalCount: z.number().int().nonnegative(),
            machineSafeCoveragePassed: z.boolean(),
            coverageCompletePassed: z.boolean(),
            boundedRequestCount: z.number().int().nonnegative(),
            wholeEpisodeWhisperRerun: z.literal(false),
          })
          .strict()
          .optional(),
        asrCache: z
          .object({
            manifestPath: relativeArtifactPathSchema,
            migrationPath: relativeArtifactPathSchema,
            mode: z.enum(["off", "read", "read-write"]),
            requestCount: z.number().int().nonnegative(),
            hitCount: z.number().int().nonnegative(),
            migratedEntryCount: z.number().int().nonnegative(),
            missCount: z.number().int().nonnegative(),
            workerRequestsAvoided: z.number().int().nonnegative(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SubtitlePackage = z.infer<typeof subtitlePackageSchema>;

export const grammarLevelSystemSchema = z.enum([
  "JLPT",
  "HSK",
  "CEFR",
  "unknown",
]);

const grammarExampleSchema = z
  .object({
    text: z.string().min(1),
    reading: z.string().min(1).nullable(),
    translation: z.string().min(1).nullable(),
  })
  .strict();

const grammarPointSchema = z
  .object({
    id: z.string().min(1),
    language: languageTagSchema,
    surface: z.string().min(1),
    pattern: z.string().min(1),
    category: z.string().min(1),
    formation: z.string().min(1),
    meaning: z.string().min(1),
    explanation: z.string().min(1),
    nuance: z.string().min(1).nullable(),
    context: z.string().min(1).nullable(),
    examples: z.array(grammarExampleSchema).min(1).max(1),
    levelSystem: grammarLevelSystemSchema,
    level: z.string().min(1),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const vocabularyItemSchema = z
  .object({
    surface: z.string().min(1),
    language: languageTagSchema,
    reading: z.string().min(1).nullable(),
    meaning: z.string().min(1),
  })
  .strict();

const grammarSentenceSchema = z
  .object({
    id: z.string().min(1),
    cueIds: z.array(z.string().min(1)),
    start: z.number().nonnegative().nullable(),
    end: z.number().positive().nullable(),
    language: languageTagSchema,
    languages: z.array(languageTagSchema).min(1),
    text: z.string().min(1),
    reading: z.string().min(1).nullable(),
    translation: z.string().min(1).nullable(),
    previousSentenceId: z.string().min(1).nullable(),
    nextSentenceId: z.string().min(1).nullable(),
    reconstructionConfidence: z.number().min(0).max(1),
    needsReview: z.boolean(),
    grammar: z.array(grammarPointSchema),
    vocabulary: z.array(vocabularyItemSchema),
  })
  .strict()
  .refine(
    (sentence) =>
      sentence.start === null ||
      sentence.end === null ||
      sentence.end > sentence.start,
    { message: "Sentence end must be greater than start." },
  );

export const grammarReportSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    reportType: z.literal("multilingual-grammar-report"),
    explanationLanguage: z.enum(["zh-CN", "ja-JP", "en"]),
    languages: z.array(languageTagSchema),
    source: z
      .object({
        type: z.enum(["subtitle", "text", "subtitle-package"]),
        title: z.string().min(1).nullable(),
      })
      .strict(),
    analysis: z
      .object({
        model: z.string().min(1),
        modelConfigurationHash: z.string().min(1),
        analyzerVersion: z.string().min(1),
        generatedAt: z.iso.datetime(),
      })
      .strict(),
    summary: z
      .object({
        sentenceCount: z.number().int().nonnegative(),
        grammarPointCount: z.number().int().nonnegative(),
        languageCounts: z.record(z.string(), z.number().int().nonnegative()),
        levelCounts: z.record(z.string(), z.number().int().nonnegative()),
      })
      .strict(),
    sentences: z.array(grammarSentenceSchema),
  })
  .strict();

export type GrammarReport = z.infer<typeof grammarReportSchema>;
