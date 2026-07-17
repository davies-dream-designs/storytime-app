import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { inngestFunctions } from '@/lib/inngest/functions'

// Inngest sync + execution endpoint. Point the Inngest dev server (or Inngest
// Cloud) at /api/inngest to discover and run the print-book pipeline functions.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
})
