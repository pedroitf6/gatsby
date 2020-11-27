import _ from "lodash"
import { isCI } from "gatsby-core-utils"
import realTerminalLink from "terminal-link"
import { IFlag } from "./flags"
import chalk from "chalk"
import { commaListsAnd } from "common-tags"
import { distance } from "fastest-levenshtein"

const terminalLink = (text, url): string => {
  if (process.env.NODE_ENV === `test`) {
    return `${text} (${url})`
  } else {
    return realTerminalLink(text, url)
  }
}

const handleFlags = (
  flags: Array<IFlag>,
  configFlags: Record<string, boolean>,
  executingCommand = process.env.gatsby_executing_command
): {
  enabledConfigFlags: Array<IFlag>
  unknownFlagMessage: string
  message: string
} => {
  // Prepare config flags.
  // Filter out any flags that are set to false.
  const availableFlags = new Map()
  flags.forEach(flag => availableFlags.set(flag.name, flag))

  // Find unknown flags someone has in their config to warn them about.
  const unknownConfigFlags = Object.keys(configFlags)
    .filter(flagName => !availableFlags.has(flagName))
    .map(flag => {
      const flagsWithDistance = flags.map(f => {
        return {
          name: f.name,
          distance: distance(flag, f.name),
        }
      })

      const minDistance = _.minBy(flagsWithDistance, f => f.distance)

      let didYouMean
      if (minDistance) {
        didYouMean = minDistance.distance < 4 ? minDistance.name : undefined
      }

      return {
        flag,
        didYouMean,
      }
    })

  let unknownFlagMessage = ``
  if (unknownConfigFlags.length > 0) {
    unknownFlagMessage = commaListsAnd`The following flag(s) found in your gatsby-config.js are not known: ${unknownConfigFlags.map(
      f => f.flag
    )}`

    const didYouMeans = unknownConfigFlags.filter(f => f.didYouMean)
    if (didYouMeans.length > 0) {
      unknownFlagMessage += `\n\n${commaListsAnd`Did you mean: ${didYouMeans.map(
        f => f.didYouMean
      )}`}?\n`
    }
  }

  let enabledConfigFlags = Object.keys(configFlags)
    .filter(name => configFlags[name] && availableFlags.has(name))
    .map(flagName => availableFlags.get(flagName))

  // If we're in CI, filter out any flags that don't want to be enabled in CI
  if (isCI()) {
    enabledConfigFlags = enabledConfigFlags.filter(flag => flag.noCi !== true)
  }

  // Filter out any flags that aren't for this environment.
  enabledConfigFlags = enabledConfigFlags.filter(
    flag => flag.command === `all` || flag.command === executingCommand
  )

  const addIncluded = (flag): void => {
    if (flag.includedFlags) {
      flag.includedFlags.forEach(includedName => {
        const incExp = flags.find(e => e.name == includedName)
        if (incExp) {
          enabledConfigFlags.push(incExp)
          addIncluded(incExp)
        }
      })
    }
  }
  // Add to enabledConfigFlags any includedFlags
  enabledConfigFlags.forEach(flag => {
    addIncluded(flag)
  })

  enabledConfigFlags = _.uniq(enabledConfigFlags)

  // TODO remove flags that longer exist.
  //  w/ message of thanks

  let message = ``
  //  Create message about what flags are active.
  if (enabledConfigFlags.length > 0) {
    message = `The following flags are active:`
    enabledConfigFlags.forEach(flag => {
      message += `\n- ${flag.name}`
      if (flag.experimental) {
        message += ` · ${chalk.white.bgRed.bold(`EXPERIMENTAL`)}`
      }
      if (flag.umbrellaIssue) {
        message += ` · (${terminalLink(`Umbrella Issue`, flag.umbrellaIssue)})`
      }
      message += ` · ${flag.description}`
    })

    // TODO renable once "gatsby flags` CLI command exists.
    // Suggest enabling other flags if they're not trying them all.
    // const otherFlagsCount = flags.length - enabledConfigFlags.length
    // if (otherFlagsCount > 0) {
    // message += `\n\nThere ${
    // otherFlagsCount === 1
    // ? `is one other flag`
    // : `are ${otherFlagsCount} other flags`
    // } available you can test — run "gatsby flags" to enable them`
    // }

    message += `\n`
  }

  return {
    enabledConfigFlags,
    message,
    unknownFlagMessage,
  }
}

export default handleFlags
