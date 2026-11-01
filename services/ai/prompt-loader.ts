import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../utils/logger.ts';

const promptCache = new Map<string, string>();

export async function loadPromptFile(filename: string): Promise<string> {
  if (promptCache.has(filename)) {
    return promptCache.get(filename)!;
  }

  try {
    const filePath = path.resolve(process.cwd(), 'prompts', 'ai', filename);
    const content = await fs.readFile(filePath, 'utf-8');
    promptCache.set(filename, content);
    return content;
  } catch (err) {
    logger.warn(`Failed to read prompt file ${filename}, using fallback`, { error: err });
    return '';
  }
}

export async function getSystemPromptWithDirectives(): Promise<string> {
  const [systemPrompt, injectionProtection] = await Promise.all([
    loadPromptFile('system.md'),
    loadPromptFile('prompt-injection-protection.md'),
  ]);

  return `${systemPrompt}\n\n${injectionProtection}`;
}
