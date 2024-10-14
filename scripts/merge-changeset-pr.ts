#!/usr/bin/env node

import { Command } from '@commander-js/extra-typings'
import { confirm } from '@inquirer/prompts'
import { execa } from 'execa'

const program = new Command()

async function getFirstPrFromGitHubActions() {
  const { stdout } = await execa('gh', [
    'pr',
    'list',
    '--app',
    'github-actions',
    '--json',
    'number,title,author,state',
  ])
  const prs = JSON.parse(stdout)
  return prs[0]
}

async function mergePr(prNumber: number) {
  await execa('gh', ['pr', 'merge', '--squash', prNumber.toString()], {
    stdio: 'inherit',
  })
}

async function commentPr(prNumber: number) {
  await execa(
    'gh',
    [
      'pr',
      'review',
      '--comment',
      '-b',
      'cli merge changeset pr',
      prNumber.toString(),
    ],
    {
      stdio: 'inherit',
    },
  )
}

async function approvePr(prNumber: number) {
  await execa('gh', ['pr', 'review', prNumber.toString(), '--approve'], {
    stdio: 'inherit',
  })
}

program
  .description('CLI to merge the first PR from GitHub Actions')
  .action(async () => {
    try {
      const pr = await getFirstPrFromGitHubActions()

      if (!pr) {
        console.log('No pull requests found from GitHub Actions.')
        return
      }

      console.log(`Found PR #${pr.number}: ${pr.title} by ${pr.author.login}`)

      const isConfirmed = await confirm({
        message: `Do you want to merge PR #${pr.number}?`,
      })

      if (isConfirmed) {
        await commentPr(pr.number)
        await approvePr(pr.number)

        await mergePr(pr.number)

        console.log(`PR #${pr.number} merged successfully!`)
      } else {
        console.log('Merge cancelled.')
      }
    } catch (error) {
      console.error('Error:', error)
    }
  })

program.parse(process.argv)
