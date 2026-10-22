(defun count-primes (limit)
  (let ((sieve (make-array 100 :initial-element 0))
        (count 0))
    (loop for i from 2 below limit do
      (when (zerop (aref sieve i))
        (incf count)
        (let ((j (* i i)))
          (loop while (< j limit) do
            (setf (aref sieve j) 1)
            (incf j i)))))
    count))

(format t "Primes below 100: ~d~%" (count-primes 100))
(format t "Primes below 30: ~d~%" (count-primes 30))
