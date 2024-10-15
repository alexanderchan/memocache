#!/usr/bin/env node

import { Command } from '@commander-js/extra-typings'
import { confirm } from '@inquirer/prompts'
import { $ } from 'zx'

$.verbose = true

const program = new Command()

/**
 * @typedef {Object} PullRequest
 * @property {number} number - The PR number
 * @property {string} title - The PR title
 * @property {{login: string}} author - The PR author
 * @property {string} state - The PR state
 */

/**
 * Fetches the first PR from GitHub Actions
 * @returns {Promise<PullRequest|undefined>}
 */
async function getFirstPrFromGitHubActions() {
  const { stdout } =
    await $`gh pr list --app github-actions --json number,title,author,state`
  const prs = JSON.parse(stdout)
  return prs[0]
}

/**
 * Merges a PR
 * @param {number} prNumber - The PR number to merge
 * @returns {Promise<void>}
 */
async function mergePr(prNumber) {
  await $`gh pr merge --squash ${prNumber}`
}

/**
 * Comments on a PR
 * @param {number} prNumber - The PR number to comment on
 * @returns {Promise<void>}
 */
async function commentPr(prNumber) {
  await $`gh pr review --comment -b "cli merge changeset pr" ${prNumber}`
}

/**
 * Approves a PR
 * @param {number} prNumber - The PR number to approve
 * @returns {Promise<void>}
 */
async function approvePr(prNumber) {
  await $`gh pr review ${prNumber} --approve`
}

program
  .description('CLI to merge the first PR from GitHub Actions')
  .action(async () => {
    try {
      const pr = await getFirstPrFromGitHubActions()

      if (!pr) {
        console.info('No pull requests found from GitHub Actions.')
        return
      }

      console.info(`Found PR #${pr.number}: ${pr.title} by ${pr.author.login}`)

      const isConfirmed = await confirm({
        message: `Do you want to merge PR #${pr.number}?`,
      })

      if (isConfirmed) {
        await commentPr(pr.number)
        await approvePr(pr.number)
        await mergePr(pr.number)

        console.info(`PR #${pr.number} merged successfully!`)
      } else {
        console.info('Merge cancelled.')
      }
    } catch (error) {
      console.error('Error:', error)
    }
  })

program.parse(process.argv)
