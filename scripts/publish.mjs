#!/usr/bin/env zx
// @ts-check
import { Command } from '@commander-js/extra-typings'
import { $ } from 'zx'

// echo out the command being executed
$.verbose = true

const program = new Command()
  .option('-m, --main-branch <branch>', 'Main branch name', 'main')
  .option('-d, --delete-branch', 'Delete branch on merge', false)
  .option('-a, --admin', 'Merge as admin', false)
  .parse(process.argv)

const options = program.opts()

async function main() {
  try {
    const fileCount = parseInt(
      (
        await $`find .changeset -type f -name "*.md" -not -name README.md | wc -l`
      ).stdout.trim(),
    )

    if (fileCount === 0) {
      console.info('No changeset to release, exiting...')
      return
    }

    console.info(`Changesets found:  ${fileCount}\n\n`)

    const branchName = `release-npm-${Date.now()}`
    const mainBranch = options.mainBranch

    // don't set user.name and user.email if already set
    try {
      const userName = (await $`git config user.name`).stdout
      const userEmail = (await $`git config user.email`).stdout

      if (!userName || !userEmail) {
        await $`git config user.name github-actions`
        await $`git config user.email github-actions@github.com`
      }
    } catch {
      // also if empty it throws
      await $`git config user.name github-actions`
      await $`git config user.email github-actions@github.com`
    }

    await $`gh auth status`

    await $`git checkout -b ${branchName}`

    await $`pnpm changeset version`
    await $`git push --follow-tags --set-upstream origin ${branchName}`

    console.info('-----------------------------------------')
    console.info('publishing all packages')
    console.info('-----------------------------------------')
    await $`pnpm changeset publish`
    await $`git push --follow-tags --set-upstream origin ${branchName}`

    // create PR
    const title = '[Release] Packages'
    const body =
      'This PR is automatically generated and will be merged. Updates triggered by new changeset.[skip ci]'

    console.info('creating pull request')
    const prUrl = (
      await $`gh pr create --title ${title} --body ${body} --base ${mainBranch}`
    ).stdout.trim()
    console.info(`[Release] ${prUrl}`)

    if (prUrl) {
      console.info(`[Release] merging PR: ${prUrl}`)
      const deleteBranch = options.deleteBranch ? '--delete-branch' : ''
      const admin = options.admin ? '--admin' : ''

      await $`gh pr merge ${prUrl} --squash ${admin} ${deleteBranch}`
    } else {
      await $`git push origin --delete ${branchName}`
      console.info('[Release] no PRs to merge')
    }
  } catch (error) {
    console.error('An error occurred:', error)
    process.exit(1)
  }
}

main()
