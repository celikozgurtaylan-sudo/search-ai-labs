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
    // Check if Supabase is available
    if (!supabase) {
      throw new Error('Supabase connection not available. Please connect to Supabase to enable LLM analysis.')
    }

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