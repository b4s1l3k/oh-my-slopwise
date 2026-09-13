import { resolve } from "node:path"
import { CandidateProcessAdapter } from "./candidate-process-adapter"
import { LegacyGoldenAdapter } from "./legacy-adapter"
import { loadGoldenSuites } from "./load-fixtures"
import {
  findGoldenResponseDrift,
  formatGoldenFailures,
  formatGoldenResponseDrift,
  runGoldenSuites,
} from "./runner"

function report(result: Awaited<ReturnType<typeof runGoldenSuites>>) {
  if (result.failures.length > 0) console.error(formatGoldenFailures(result.failures))
  console.log(`Golden: ${result.passed}/${result.total} passed with ${result.adapter}`)
}

async function main() {
  const goldenRoot = resolve(import.meta.dirname, "../../contracts/golden")
  const [mode = "legacy", command, ...candidateArgs] = process.argv.slice(2)
  const suites = loadGoldenSuites(goldenRoot)

  if (mode === "legacy") {
    const result = await runGoldenSuites(suites, new LegacyGoldenAdapter())
    report(result)
    if (result.failures.length > 0) process.exitCode = 1
  } else if ((mode === "candidate" || mode === "compare") && command) {
    const candidateAdapter = new CandidateProcessAdapter(command, candidateArgs)
    if (mode === "candidate") {
      const result = await runGoldenSuites(suites, candidateAdapter)
      report(result)
      if (result.failures.length > 0) process.exitCode = 1
    } else {
      const [legacyResult, candidateResult] = await Promise.all([
        runGoldenSuites(suites, new LegacyGoldenAdapter()),
        runGoldenSuites(suites, candidateAdapter),
      ])
      report(legacyResult)
      report(candidateResult)
      console.log(formatGoldenResponseDrift(findGoldenResponseDrift(suites, legacyResult, candidateResult)))
      if (legacyResult.failures.length > 0 || candidateResult.failures.length > 0) {
        process.exitCode = 1
      }
    }
  } else {
    throw new Error(
      "Usage: node --import tsx scripts/golden/run.ts " +
        "legacy | candidate <executable> [arguments...] | compare <executable> [arguments...]"
    )
  }
}

void main()
