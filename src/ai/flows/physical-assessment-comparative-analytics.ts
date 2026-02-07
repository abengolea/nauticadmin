'use server';
/**
 * @fileOverview Generative AI tool to provide comparative analytics on a player's trend data in physical tests over time,
 * measured against club medians, to quickly identify areas for improvement and tailor training plans effectively.
 *
 * - analyzePlayerPerformance - A function that analyzes a player's physical assessment data against club medians.
 * - AnalyzePlayerPerformanceInput - The input type for the analyzePlayerPerformance function.
 * - AnalyzePlayerPerformanceOutput - The return type for the analyzePlayerPerformance function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzePlayerPerformanceInputSchema = z.object({
  playerId: z.string().describe('The ID of the player to analyze.'),
  clubId: z.string().describe('The ID of the club the player belongs to.'),
  testType: z.string().describe('The type of physical test to analyze (e.g., sprint_10m, vertical_jump).'),
});
export type AnalyzePlayerPerformanceInput = z.infer<typeof AnalyzePlayerPerformanceInputSchema>;

const AnalyzePlayerPerformanceOutputSchema = z.object({
  analysis: z.string().describe('A detailed analysis of the player’s performance trends compared to club medians, highlighting areas for improvement.'),
});
export type AnalyzePlayerPerformanceOutput = z.infer<typeof AnalyzePlayerPerformanceOutputSchema>;

export async function analyzePlayerPerformance(input: AnalyzePlayerPerformanceInput): Promise<AnalyzePlayerPerformanceOutput> {
  return analyzePlayerPerformanceFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzePlayerPerformancePrompt',
  input: {schema: AnalyzePlayerPerformanceInputSchema},
  output: {schema: AnalyzePlayerPerformanceOutputSchema},
  prompt: `You are an expert sports performance analyst.

You are provided with the performance data of a player within their club for a specific test type.
Analyze the player's performance trend over time compared to the club's median performance in the same test.
Identify the player's strengths and weaknesses, and suggest areas for improvement.

Player ID: {{{playerId}}}
Club ID: {{{clubId}}}
Test Type: {{{testType}}}

Provide a concise analysis that coaches can use to tailor training plans effectively.
`,
});

const analyzePlayerPerformanceFlow = ai.defineFlow(
  {
    name: 'analyzePlayerPerformanceFlow',
    inputSchema: AnalyzePlayerPerformanceInputSchema,
    outputSchema: AnalyzePlayerPerformanceOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
