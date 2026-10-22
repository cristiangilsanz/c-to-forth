(setq composite (make-array 50 :initial-element 0))

(defun main ()
  (let* ((i 0)
         (j 0))
    (setf i 2)
    (loop while (< (* i i) 50) do
      (when (= (aref composite i) 0)
        (setf j (* i i))
        (loop while (< j 50) do
          (setf (aref composite j) 1)
          (incf j i)))
      (incf i))
    (format t "Primes below 50:")
    (loop for i from 2 below 50 do
      (when (= (aref composite i) 0) (format t " ~d" i)))
    (format t "~%")))

(main)
