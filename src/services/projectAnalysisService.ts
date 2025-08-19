import { supabase } from '@/integrations/supabase/client'

export interface ProjectAnalysis {
  summary: string
  researchMethods: string[]
  targetAudience: string
  keyQuestions: string[]
  timeline: string
  insights: string
}

export const analyzeProject = async (description: string): Promise<ProjectAnalysis> => {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-project', {
      body: { description }
    })

    if (error) {
      console.error('Supabase function error:', error)
      throw new Error(`Analysis failed: ${error.message}`)
    }

    if (!data?.analysis) {
      throw new Error('Invalid response format from analysis service')
    }

    return data.analysis
  } catch (error) {
    console.error('Project analysis error:', error)
    throw error
  }
}