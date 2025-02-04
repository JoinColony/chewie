const { findLast } = require('lodash')
require('dotenv').config()



const prHelpers = robot => {
  const github = require('githubot')(robot)
  const repo = github.qualified_repo(process.env.HUBOT_GITHUB_REPO)
  const BASE_URL = `https://api.github.com/repos/${repo}`

  const ghget = async function(url) {
    return new Promise(resolve => {
      github.get(url, res => {
        resolve(res)
      })
    })
  }


  const getPRs = async (base_url) => {
    if (!base_url) {
      base_url = BASE_URL
    }
    const prs = [];
    let n = 1;
    let pageContents = ["temp"];
    while (pageContents.length > 0) {
      pageContents = await ghget(`${base_url}/pulls?page=${n}`);
      prs.push(...pageContents);
      n++;
    }
    return prs;
      // return new Promise(resolve => {
      //   github.get(`${base_url}/pulls`, res => {
      //     resolve(res)
      //   })
      // })
  }

  const getTeamMembers = async (org_name, team_slug) => {
    return new Promise(resolve => {
      github.get(`https://api.github.com/orgs/${org_name}/teams/${team_slug}/members`, res => {
        resolve(res)
      })
    })
  }

  const getReviewRequestedAt = async pr => {
    const prEvents = await getPREvents(pr)
    // events are sorted by date ascending, i.e. most recent last
    const mostRecentReviewRequest = findLast(
      prEvents,
      prEvent => prEvent.event === 'review_requested'
    )

    const mostRecentDraftEvent = findLast(
      prEvents,
      prEvent => prEvent.event === 'convert_to_draft'
    )

    if (mostRecentReviewRequest) {
      if (mostRecentDraftEvent) {
        const convertedToDraft_ms = new Date(
          mostRecentDraftEvent['created_at']
        ).valueOf()

        const reviewRequestCreatedAt_ms = new Date(
          mostRecentReviewRequest['created_at']
        ).valueOf()

        /*
         * If converted back to draft more recently than review requested
         * PR is currently in draft.
         */
        if (convertedToDraft_ms > reviewRequestCreatedAt_ms) {
          return null
        }
      }

      return mostRecentReviewRequest['created_at']
    }
    return null
  }

  const getPREvents = async pr => {
    const events = []
    let nOnPage = 30
    let page = 1

    while (nOnPage === 30) {
      const res = await ghget(`${pr.issue_url}/events?per_page=${nOnPage}&page=${page}`)
      nOnPage = res.length
      page +=1
      events.push(...res)
    }

    return events
  }

  const getReviews = async pr => {
      const reviews = []
      let nOnPage = 30
      let page = 1
      while (nOnPage === 30) {
        const res = await ghget(`${pr.url}/reviews?per_page=${nOnPage}&page=${page}`)
        nOnPage = res.length
        page +=1
        reviews.push(...res)
      }
      return reviews
  }

  const getComments = async pr => {
    const comments = []
    let nOnPage = 30
    let page = 1
    while (nOnPage === 30) {
      const res = await ghget(`${pr.url}/comments?per_page=${nOnPage}&page=${page}`)
      nOnPage = res.length
      page +=1
      comments.push(...res)
    }
    return comments
 
  }

  const isReviewOld = (reviewRequestedTimeStamp, threshold) => {
    const reviewRequested_ms = new Date(reviewRequestedTimeStamp).valueOf()
    const now_ms = new Date().valueOf()
    const interval_ms = threshold * 24 * 60 * 60 * 1000
    return now_ms - reviewRequested_ms > interval_ms
  }

  // Returns an array of PRs that have a review_requested event that is over x days old
  const getPRsWithReviewsRequested = (prs, daysSinceRequested) => {
    return prs.reduce(async (reviewsRequested, pr) => {
      const reviewRequestedAt = await getReviewRequestedAt(pr)
      if (reviewRequestedAt) {
        const isOld = isReviewOld(reviewRequestedAt, daysSinceRequested)
        // pr was last updated over x days ago
        if (isOld) {
          ;(await reviewsRequested).push(pr)
        }
      }
      return await reviewsRequested
    }, [])
  }

  const filterOutReviewsByAssignee = async (reviews, pr) => {
    const prEvents = await getPREvents(pr)
    const mostRecentAssignedEvent = findLast(
      prEvents,
      prEvent => prEvent.event === 'assigned'
    )
    if (mostRecentAssignedEvent) {
      const assignee = mostRecentAssignedEvent['assignee']['login']

      // Remove reviews by the pr's assignee (e.g. code comments in github).
      // We're only interested in reviews from other team members.
      return reviews.filter(r => r['user']['login'] !== assignee)
    }

    return reviews
  }

  const getPRsWithoutReviews = async (prs, numDays) => {
    const prsWithReviewsRequested = await getPRsWithReviewsRequested(
      prs,
      numDays
    )
    return prsWithReviewsRequested.reduce(async (prsWithoutReviews, pr) => {
      const reviews = await getReviews(pr)
      const reviewsByOthers = await filterOutReviewsByAssignee(reviews, pr)
      if (reviewsByOthers.length === 0) (await prsWithoutReviews).push(pr)
      return await prsWithoutReviews
    }, [])
  }

  const getPRCommits = async pr => {
    const commits = []
    let nOnPage = 30
    let page = 1
    while (nOnPage === 30) {
      const res = await ghget(`${pr.url}/commits?per_page=${nOnPage}&page=${page}`)
      nOnPage = res.length
      page +=1
      commits.push(...res)
    }
    return commits
  }

  return {
    getPRs,
    getPRsWithoutReviews,
    getPREvents,
    getReviews,
    getComments,
    getPRCommits,
    getTeamMembers,
  }
}

module.exports = { prHelpers }
